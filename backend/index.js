// index.js
require('dotenv').config();
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const TARGET_CONTACT = process.env.TARGET_CONTACT || '918299515901@c.us';
const MEDIA_DIR = path.join(__dirname, 'public');
const BASE_URL = process.env.PUBLIC_URL || 'http://localhost:3001';
const RECONNECT_DELAY_MS = parseInt(process.env.RECONNECT_DELAY_MS || '10000', 10);
const MAX_CONSECUTIVE_ERRORS = 3;

if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(MEDIA_DIR));

let mediaCounter = 0;
let latestQR = null;
let isClientReady = false;
let messageCache = [];
const MAX_CACHE_SIZE = 100;
let connectedClients = new Set();
let consecutiveErrors = 0;
let isReconnecting = false;
let clientInstance = null;

// --------- Helper functions ----------
function safeFilename(ext = 'bin') {
  mediaCounter = (mediaCounter + 1) % 10000;
  return `media_${Date.now()}_${mediaCounter}.${ext}`;
}

function clientIsReady() {
  return !!(clientInstance && clientInstance.info && clientInstance.info.wid && isClientReady);
}

function addToCache(message) {
  const exists = messageCache.some(m => 
    m.timestamp === message.timestamp && 
    m.body === message.body &&
    m.from === message.from
  );
  
  if (!exists) {
    messageCache.unshift(message);
    if (messageCache.length > MAX_CACHE_SIZE) {
      messageCache = messageCache.slice(0, MAX_CACHE_SIZE);
    }
    return true;
  }
  return false;
}

function broadcastToClients(event, data) {
  const count = connectedClients.size;
  if (count > 0) {
    io.emit(event, data);
  }
}

// --------- Error Detection and Recovery ----------
function handleDetachedFrameError(context) {
  consecutiveErrors++;
  console.error(`⚠️  Detached frame error detected in ${context} (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})`);
  
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS && !isReconnecting) {
    console.log('🔄 Too many consecutive errors - triggering reconnection...');
    triggerReconnection();
  }
}

async function triggerReconnection() {
  if (isReconnecting) {
    console.log('⏳ Reconnection already in progress...');
    return;
  }
  
  isReconnecting = true;
  isClientReady = false;
  
  try {
    console.log('🔄 Starting reconnection process...');
    broadcastToClients('reconnecting', { reason: 'detached_frame' });
    
    // Destroy current client
    if (clientInstance) {
      try {
        await clientInstance.destroy();
        console.log('✅ Old client destroyed');
      } catch (err) {
        console.warn('Failed to destroy old client:', err.message);
      }
    }
    
    // Wait a bit before reinitializing
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Clear error count
    consecutiveErrors = 0;
    
    // Create and initialize new client
    console.log('🔄 Creating new client instance...');
    clientInstance = createNewClient();
    await clientInstance.initialize();
    
  } catch (err) {
    console.error('❌ Reconnection failed:', err.message);
    isReconnecting = false;
    
    // Retry after delay
    setTimeout(() => {
      if (!isClientReady) {
        console.log('🔄 Retrying reconnection...');
        triggerReconnection();
      }
    }, RECONNECT_DELAY_MS);
  }
}

// --------- Client Creation ----------
function createNewClient() {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled'
      ],
      timeout: 60000
    }
  });

  // --------- Client events ----------
  client.on('qr', (qr) => {
    latestQR = qr;
    isClientReady = false;
    console.log('📱 QR CODE RECEIVED - Scan to authenticate');
    qrcode.generate(qr, { small: true });
    broadcastToClients('qr', qr);
  });

  client.on('authenticated', () => {
    console.log('✅ Authentication successful');
    latestQR = null;
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    broadcastToClients('auth_failure', { error: msg });
  });

  client.on('ready', async () => {
    try {
      isClientReady = true;
      isReconnecting = false;
      consecutiveErrors = 0;
      
      console.log('✅ WhatsApp client ready!');
      console.log(`📱 Connected as: ${client.info.pushname} (${client.info.wid.user})`);
      
      broadcastToClients('ready', { status: 'connected' });

      // Load initial messages (with error handling)
      try {
        console.log('📥 Loading recent messages...');
        const targetChat = await client.getChatById(TARGET_CONTACT);
        
        if (targetChat) {
          const messages = await targetChat.fetchMessages({ limit: 50 });
          console.log(`Found ${messages.length} messages`);
          
          for (const msg of messages.reverse()) {
            let mediaUrl = null;
            if (msg.hasMedia) {
              try {
                const media = await msg.downloadMedia();
                if (media && media.data) {
                  const buffer = Buffer.from(media.data, 'base64');
                  const ext = (media.mimetype && media.mimetype.split('/')[1]) || 'bin';
                  const filename = safeFilename(ext);
                  const filepath = path.join(MEDIA_DIR, filename);
                  fs.writeFileSync(filepath, buffer);
                  mediaUrl = `${BASE_URL}/media/${filename}`;
                }
              } catch (mErr) {
                // Skip media errors
              }
            }

            addToCache({
              from: msg.from,
              to: msg.to,
              body: msg.body,
              timestamp: msg.timestamp,
              mediaUrl,
              mimetype: msg._data?.mimetype || null
            });
          }
          
          console.log(`✅ Cached ${messageCache.length} messages`);
          
          // Send to all clients
          messageCache.slice().reverse().forEach(msg => {
            broadcastToClients('message', msg);
          });
        }
      } catch (err) {
        console.warn('⚠️  Could not load initial messages:', err.message);
        if (err.message.includes('detached Frame')) {
          handleDetachedFrameError('ready');
        }
      }
    } catch (err) {
      console.error('Error in ready handler:', err.message);
    }
  });

  client.on('message', async (msg) => {
    try {
      if (msg.from === TARGET_CONTACT || msg.to === TARGET_CONTACT) {
        // Reset error counter on successful message
        consecutiveErrors = 0;
        
        let mediaUrl = null;
        if (msg.hasMedia) {
          try {
            const media = await msg.downloadMedia();
            if (media && media.data) {
              const buffer = Buffer.from(media.data, 'base64');
              const ext = (media.mimetype && media.mimetype.split('/')[1]) || 'bin';
              const filename = safeFilename(ext);
              const filepath = path.join(MEDIA_DIR, filename);
              fs.writeFileSync(filepath, buffer);
              mediaUrl = `${BASE_URL}/media/${filename}`;
            }
          } catch (mErr) {
            console.warn('Media download failed:', mErr.message);
          }
        }

        const direction = msg.fromMe ? '📤' : '📥';
        console.log(`${direction} [${msg.from.split('@')[0]}] ${msg.body || '[Media]'}`);
        
        const payload = {
          from: msg.from,
          to: msg.to,
          body: msg.body,
          timestamp: msg.timestamp,
          mediaUrl,
          mimetype: msg._data?.mimetype || null
        };

        const isNew = addToCache(payload);
        if (isNew) {
          broadcastToClients('message', payload);
        }
      }
    } catch (err) {
      console.error('Error handling message:', err.message);
      if (err.message.includes('detached Frame')) {
        handleDetachedFrameError('message');
      }
    }
  });

  client.on('message_create', async (msg) => {
    try {
      if (msg.to === TARGET_CONTACT && msg.fromMe) {
        consecutiveErrors = 0;
        
        const payload = {
          from: msg.from || (client.info.wid?._serialized || 'me'),
          to: msg.to,
          body: msg.body,
          timestamp: msg.timestamp || Date.now(),
          mediaUrl: null,
          mimetype: null
        };

        const isNew = addToCache(payload);
        if (isNew) {
          console.log(`📤 [You] ${msg.body || '[Media]'}`);
          broadcastToClients('message', payload);
        }
      }
    } catch (err) {
      console.error('Error in message_create:', err.message);
      if (err.message.includes('detached Frame')) {
        handleDetachedFrameError('message_create');
      }
    }
  });

  client.on('disconnected', (reason) => {
    console.error('❌ WhatsApp disconnected:', reason);
    isClientReady = false;
    broadcastToClients('disconnected', { reason });

    if (!isReconnecting) {
      setTimeout(() => {
        console.log('🔄 Attempting auto-reconnect...');
        triggerReconnection();
      }, RECONNECT_DELAY_MS);
    }
  });

  client.on('change_state', (state) => {
    console.log('📶 State:', state);
  });

  client.on('error', (err) => {
    console.error('❌ Client error:', err.message);
    if (err.message.includes('detached Frame')) {
      handleDetachedFrameError('client_error');
    }
  });

  return client;
}

// --------- HTTP routes ----------
app.get('/health', (req, res) => {
  res.json({
    status: isClientReady ? 'connected' : (latestQR ? 'qr_required' : 'disconnected'),
    clients: connectedClients.size,
    cacheSize: messageCache.length,
    isReconnecting,
    consecutiveErrors
  });
});

app.get('/sync-messages', async (req, res) => {
  if (!clientIsReady()) {
    return res.status(503).json({ error: 'Client not ready' });
  }

  res.json({ 
    message: 'Synced from cache', 
    count: messageCache.length,
    success: true
  });

  messageCache.slice().reverse().forEach(msg => {
    broadcastToClients('message', msg);
  });
});

app.get('/cache-info', (req, res) => {
  res.json({
    cacheSize: messageCache.length,
    maxCacheSize: MAX_CACHE_SIZE,
    connectedClients: connectedClients.size,
    oldestMessage: messageCache[messageCache.length - 1] || null,
    newestMessage: messageCache[0] || null
  });
});

app.get('/debug-info', (req, res) => {
  res.json({
    ready: clientIsReady(),
    latestQR: !!latestQR,
    cacheSize: messageCache.length,
    connectedClients: connectedClients.size,
    consecutiveErrors,
    isReconnecting
  });
});

app.post('/force-reconnect', async (req, res) => {
  console.log('🔄 Manual reconnect triggered via API');
  res.json({ message: 'Reconnection initiated' });
  triggerReconnection();
});

// --------- Socket.IO ----------
io.on('connection', (socket) => {
  connectedClients.add(socket.id);
  console.log(`🔌 Client connected [${socket.id}] - Total: ${connectedClients.size}`);

  if (clientIsReady()) {
    socket.emit('ready', { status: 'connected' });
    
    if (messageCache.length > 0) {
      console.log(`📤 Sending ${messageCache.length} messages to new client`);
      messageCache.slice().reverse().forEach(msg => socket.emit('message', msg));
    }
  } else if (latestQR) {
    socket.emit('qr', latestQR);
  } else if (isReconnecting) {
    socket.emit('reconnecting', { reason: 'system_recovery' });
  } else {
    socket.emit('disconnected', { reason: 'not_ready' });
  }

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id);
    console.log(`🔌 Client disconnected [${socket.id}] - Total: ${connectedClients.size}`);
  });

  socket.on('request_status', () => {
    if (clientIsReady()) {
      socket.emit('ready', { status: 'connected' });
    } else if (latestQR) {
      socket.emit('qr', latestQR);
    } else if (isReconnecting) {
      socket.emit('reconnecting', { reason: 'system_recovery' });
    } else {
      socket.emit('disconnected', { reason: 'not_ready' });
    }
  });

  socket.on('send_message', async ({ message }) => {
    if (!clientIsReady()) {
      return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
    }
    
    try {
      console.log(`📤 Sending: "${message}"`);
      await clientInstance.sendMessage(TARGET_CONTACT, message, { sendSeen: false });
      
      const payload = {
        from: clientInstance.info.wid?._serialized || 'me',
        to: TARGET_CONTACT,
        body: message,
        timestamp: Date.now(),
        mediaUrl: null,
        mimetype: null
      };
      
      if (addToCache(payload)) {
        broadcastToClients('message', payload);
      }
      
      consecutiveErrors = 0;
      socket.emit('send_result', { ok: true });
      
    } catch (err) {
      console.error('❌ Send failed:', err.message);
      
      if (err.message.includes('detached Frame')) {
        handleDetachedFrameError('send_message');
      }
      
      socket.emit('send_result', { ok: false, error: err.message });
    }
  });

  socket.on('send_media', async ({ base64, mimetype, filename }) => {
    if (!clientIsReady()) {
      return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
    }
    
    try {
      const base64Body = base64.includes(',') ? base64.split(',')[1] : base64;
      const media = new MessageMedia(mimetype, base64Body, filename);
      
      console.log(`📤 Sending media: ${filename}`);
      await clientInstance.sendMessage(TARGET_CONTACT, media, { sendSeen: false });

      const payload = {
        from: clientInstance.info.wid?._serialized || 'me',
        to: TARGET_CONTACT,
        body: `[${filename}]`,
        timestamp: Date.now(),
        mediaUrl: null,
        mimetype
      };
      
      if (addToCache(payload)) {
        broadcastToClients('message', payload);
      }

      consecutiveErrors = 0;
      socket.emit('send_result', { ok: true });
      
    } catch (err) {
      console.error('❌ Send media failed:', err.message);
      
      if (err.message.includes('detached Frame')) {
        handleDetachedFrameError('send_media');
      }
      
      socket.emit('send_result', { ok: false, error: err.message });
    }
  });
});

// --------- Start server ----------
const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Target: ${TARGET_CONTACT}`);
  console.log(`🔄 Auto-recovery enabled (${MAX_CONSECUTIVE_ERRORS} errors threshold)`);
});

// Initialize first client
clientInstance = createNewClient();
clientInstance.initialize().catch(err => {
  console.error('Failed to initialize:', err.message);
  setTimeout(() => triggerReconnection(), 5000);
});

// --------- Cleanup ----------
setInterval(() => {
  try {
    const now = Date.now();
    const files = fs.readdirSync(MEDIA_DIR);
    let deleted = 0;
    
    files.forEach(file => {
      try {
        const filePath = path.join(MEDIA_DIR, file);
        const stats = fs.statSync(filePath);
        if ((now - stats.mtimeMs) / (1000 * 60 * 60 * 24) > 15) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (e) {}
    });
    
    if (deleted > 0) console.log(`🧹 Deleted ${deleted} old files`);
  } catch (err) {}
}, 1000 * 60 * 60 * 12);

// --------- Shutdown ----------
async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down...`);
  isClientReady = false;
  broadcastToClients('server_shutdown', { reason: signal });
  
  try { 
    if (clientInstance) await clientInstance.destroy(); 
  } catch (e) {}
  
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
  
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
