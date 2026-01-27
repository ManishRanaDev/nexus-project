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
const { sendPush } = require('./pushService');

const TARGET_CONTACT = process.env.TARGET_CONTACT || '918299515901@c.us';
const MEDIA_DIR = path.join(__dirname, 'public');
const BASE_URL = process.env.PUBLIC_URL || 'http://localhost:3001';
const RECONNECT_DELAY_MS = parseInt(process.env.RECONNECT_DELAY_MS || '5000', 10);

const TOKENS_FILE = path.join(__dirname, 'deviceTokens.json');

const STEALTH_MESSAGES = [
  'New event received',
  'Background task completed',
  'Secure channel activity',
  'Input stream updated',
  'Signal received',
  'Remote task executed',
  'System update detected',
  'New log entry created',
  'Process completed successfully'
];

let isInitializing = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

function getStealthNotification() {
  return STEALTH_MESSAGES[Math.floor(Math.random() * STEALTH_MESSAGES.length)];
}

function loadDeviceTokens() {
  try {
    const raw = fs.readFileSync(TOKENS_FILE, 'utf8');
    return new Set(JSON.parse(raw));
  } catch {
    fs.writeFileSync(TOKENS_FILE, '[]');
    return new Set();
  }
}

function saveDeviceTokens() {
  fs.writeFileSync(TOKENS_FILE, JSON.stringify([...deviceTokens], null, 2));
}

const deviceTokens = loadDeviceTokens();

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

// CRITICAL FIX: Simpler Puppeteer configuration
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'nexus-client'
  }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

// --------- Helper functions ----------
function safeFilename(ext = 'bin') {
  mediaCounter = (mediaCounter + 1) % 10000;
  return `media_${Date.now()}_${mediaCounter}.${ext}`;
}

function clientIsReady() {
  return !!(client && client.info && client.info.wid && isClientReady);
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
  console.log(`📡 Broadcasting ${event} to ${connectedClients.size} clients`);
  io.emit(event, data);
}

// --------- HTTP routes ----------
app.get('/health', (req, res) => {
  if (clientIsReady()) {
    res.status(200).json({ status: 'connected', clients: connectedClients.size });
  } else if (latestQR) {
    res.status(200).json({ status: 'qr_required', clients: connectedClients.size });
  } else {
    res.status(200).json({ status: 'disconnected', clients: connectedClients.size });
  }
});

app.get('/sync-messages', async (req, res) => {
  if (!clientIsReady()) {
    console.error('Sync aborted: WhatsApp client not ready');
    return res.status(503).json({ error: 'WhatsApp client not ready' });
  }

  try {
    console.log(`📤 Returning ${messageCache.length} cached messages`);

    res.status(200).json({
      message: 'Messages synced from cache',
      count: messageCache.length,
      success: true
    });

    messageCache.slice().reverse().forEach(msg => {
      broadcastToClients('message', msg);
    });

  } catch (err) {
    console.error('❌ Sync failed:', err && err.stack ? err.stack : err);
    res.status(500).json({
      error: 'Sync failed',
      detail: String(err && err.message ? err.message : err),
      success: false
    });
  }
});

app.get('/cache-info', (req, res) => {
  res.json({
    cacheSize: messageCache.length,
    maxCacheSize: MAX_CACHE_SIZE,
    connectedClients: connectedClients.size,
    oldestMessage: messageCache[messageCache.length - 1]?.timestamp || null,
    newestMessage: messageCache[0]?.timestamp || null
  });
});

app.get('/debug-info', (req, res) => {
  res.json({
    ready: clientIsReady(),
    info: client.info || null,
    latestQR: !!latestQR,
    cacheSize: messageCache.length,
    connectedClients: connectedClients.size,
    reconnectAttempts: reconnectAttempts,
    isInitializing: isInitializing
  });
});

app.post('/test-send', async (req, res) => {
  if (!clientIsReady()) {
    return res.status(503).json({ error: 'Client not ready' });
  }

  try {
    console.log('Testing send to:', TARGET_CONTACT);
    const result = await client.sendMessage(TARGET_CONTACT, 'Test message from backend', { sendSeen: false });
    res.json({ success: true, result });
  } catch (err) {
    console.error('Test send failed:', err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

app.post('/register-device', (req, res) => {
  const { token } = req.body;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token_required' });
  }

  const before = deviceTokens.size;
  deviceTokens.add(token);

  if (deviceTokens.size !== before) {
    saveDeviceTokens();
    console.log('📲 Device token stored:', token.slice(0, 12));
  }

  res.json({ success: true });
});

// --------- Client events ----------
client.on('qr', (qr) => {
  latestQR = qr;
  isClientReady = false;
  console.log('📱 QR RECEIVED');
  qrcode.generate(qr, { small: true });
  broadcastToClients('qr', qr);
});

client.on('authenticated', () => {
  console.log('✅ Authentication successful');
  console.log('⏳ Connecting to WhatsApp...');
  latestQR = null;
  broadcastToClients('authenticated', { status: 'authenticated' });
});

client.on('auth_failure', (msg) => {
  console.error('❌ Auth failed:', msg);
  isInitializing = false;
  broadcastToClients('auth_failure', { error: msg });
});

client.on('loading_screen', (percent, message) => {
  console.log(`⏳ Loading: ${percent}% - ${message}`);
  broadcastToClients('loading', { percent, message });
});

// CRITICAL FIX: Simplified ready handler
client.on('ready', async () => {
  console.log('🎉🎉🎉 READY EVENT FIRED 🎉🎉🎉');
  
  isClientReady = true;
  isInitializing = false;
  reconnectAttempts = 0;
  latestQR = null;
  
  console.log('📱 Connected as:', client.info?.pushname || 'Unknown');
  console.log('📞 Phone:', client.info?.wid?._serialized || 'Unknown');
  
  // Broadcast ready immediately
  broadcastToClients('ready', { 
    status: 'connected',
    info: {
      pushname: client.info?.pushname || 'User',
      phone: client.info?.wid?._serialized || 'Unknown'
    }
  });

  console.log('✅ Client is now READY and accepting messages!');
  
  // Load messages in background (don't wait)
  setTimeout(async () => {
    try {
      console.log('📥 Loading initial messages...');
      const chats = await client.getChats();
      const targetChat = chats.find(chat => chat.id._serialized === TARGET_CONTACT);
      
      if (targetChat) {
        const messages = await targetChat.fetchMessages({ limit: 50 });
        console.log(`Found ${messages.length} messages`);

        for (const msg of messages.reverse()) {
          try {
            let mediaUrl = null;
            
            if (msg.hasMedia) {
              try {
                const media = await msg.downloadMedia();
                if (media?.data) {
                  const buffer = Buffer.from(media.data, 'base64');
                  const ext = media.mimetype?.split('/')[1] || 'bin';
                  const filename = safeFilename(ext);
                  fs.writeFileSync(path.join(MEDIA_DIR, filename), buffer);
                  mediaUrl = `${BASE_URL}/media/${filename}`;
                }
              } catch (e) {
                console.warn('Media download failed:', e.message);
              }
            }

            const payload = {
              from: msg.from,
              to: msg.to,
              body: msg.body || '',
              timestamp: msg.timestamp,
              mediaUrl,
              mimetype: msg._data?.mimetype || null
            };

            addToCache(payload);
          } catch (e) {
            console.warn('Message processing error:', e.message);
          }
        }

        console.log(`✅ Cached ${messageCache.length} messages`);
        
        // Broadcast all messages
        messageCache.slice().reverse().forEach(msg => {
          broadcastToClients('message', msg);
        });
      }
    } catch (err) {
      console.error('Error loading messages:', err.message);
    }
  }, 2000);
});

// Message handlers
client.on('message', async (msg) => {
  try {
    console.log(`📨 Incoming message from ${msg.from}`);
    
    if (msg.from === TARGET_CONTACT || msg.to === TARGET_CONTACT) {
      let mediaUrl = null;
      
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media?.data) {
            const buffer = Buffer.from(media.data, 'base64');
            const ext = media.mimetype?.split('/')[1] || 'bin';
            const filename = safeFilename(ext);
            fs.writeFileSync(path.join(MEDIA_DIR, filename), buffer);
            mediaUrl = `${BASE_URL}/media/${filename}`;
          }
        } catch (e) {
          console.warn('Media download failed:', e.message);
        }
      }

      const payload = {
        from: msg.from,
        to: msg.to,
        body: msg.body || '',
        timestamp: msg.timestamp,
        mediaUrl,
        mimetype: msg._data?.mimetype || null
      };

      const isNew = addToCache(payload);
      
      if (isNew) {
        console.log(`📤 Broadcasting message to ${connectedClients.size} clients`);
        broadcastToClients('message', payload);
      }
      
      // Push notification
      if (!msg.fromMe && deviceTokens.size > 0) {
        sendPush(
          [...deviceTokens],
          {
            title: 'Nexus Terminal',
            body: getStealthNotification(),
            data: { type: 'incoming_signal', ts: String(msg.timestamp) }
          },
          (deadToken) => {
            deviceTokens.delete(deadToken);
            saveDeviceTokens();
          }
        ).catch(err => console.error('Push failed:', err.message));
      }
    }
  } catch (err) {
    console.error('Error in message handler:', err.message);
  }
});

client.on('message_create', async (msg) => {
  try {
    if (msg.to === TARGET_CONTACT && msg.fromMe) {
      const payload = {
        from: client.info?.wid?._serialized || 'me',
        to: msg.to,
        body: msg.body || '',
        timestamp: msg.timestamp || Date.now(),
        mediaUrl: null,
        mimetype: null
      };

      const isNew = addToCache(payload);
      if (isNew) {
        console.log(`📤 Broadcasting sent message`);
        broadcastToClients('message', payload);
      }
    }
  } catch (err) {
    console.error('Error in message_create:', err.message);
  }
});

client.on('disconnected', (reason) => {
  console.error('❌ WhatsApp disconnected:', reason);
  isClientReady = false;
  isInitializing = false;
  latestQR = null;
  
  broadcastToClients('disconnected', { reason });

  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    console.log(`🔄 Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
    
    setTimeout(() => {
      if (!isInitializing && !isClientReady) {
        isInitializing = true;
        console.log('Attempting to re-initialize...');
        client.initialize().catch(e => {
          console.error('Re-init failed:', e.message);
          isInitializing = false;
        });
      }
    }, RECONNECT_DELAY_MS * reconnectAttempts);
  } else {
    console.error('❌ Max reconnection attempts reached.');
    broadcastToClients('max_reconnect_reached', { message: 'Please restart the server' });
  }
});

client.on('change_state', (state) => {
  console.log('📶 State changed:', state);
  broadcastToClients('state_change', { state });
});

client.on('error', (err) => {
  console.error('❌ Client error:', err.message);
});

// --------- Socket.IO ----------
io.on('connection', (socket) => {
  connectedClients.add(socket.id);
  console.log(`🔌 Client connected [${socket.id}] - Total: ${connectedClients.size}`);

  if (clientIsReady()) {
    socket.emit('ready', { status: 'connected' });

    if (messageCache.length > 0) {
      console.log(`📤 Sending ${messageCache.length} cached messages`);
      messageCache.slice().reverse().forEach(msg => {
        socket.emit('message', msg);
      });
    }
  } else if (latestQR) {
    socket.emit('qr', latestQR);
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
    } else {
      socket.emit('disconnected', { reason: 'not_ready' });
    }
  });

  socket.on('send_message', async ({ message }) => {
    if (!clientIsReady()) {
      return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
    }

    try {
      console.log(`📤 Sending message to ${TARGET_CONTACT}`);
      await client.sendMessage(TARGET_CONTACT, message, { sendSeen: false });

      const payload = {
        from: client.info?.wid?._serialized || 'me',
        to: TARGET_CONTACT,
        body: message,
        timestamp: Date.now(),
        mediaUrl: null,
        mimetype: null
      };

      const isNew = addToCache(payload);
      if (isNew) {
        broadcastToClients('message', payload);
      }

      socket.emit('send_result', { ok: true });
    } catch (err) {
      console.error('Send failed:', err.message);
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
      await client.sendMessage(TARGET_CONTACT, media, { sendSeen: false });

      const payload = {
        from: client.info?.wid?._serialized || 'me',
        to: TARGET_CONTACT,
        body: `[Media: ${filename}]`,
        timestamp: Date.now(),
        mediaUrl: null,
        mimetype
      };

      const isNew = addToCache(payload);
      if (isNew) {
        broadcastToClients('message', payload);
      }

      socket.emit('send_result', { ok: true });
    } catch (err) {
      console.error('Send media failed:', err.message);
      socket.emit('send_result', { ok: false, error: err.message });
    }
  });
});

// --------- Start server ----------
const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Target contact: ${TARGET_CONTACT}`);
});

// Initialize client
console.log('🚀 Initializing WhatsApp client...');
isInitializing = true;

client.initialize()
  .then(() => console.log('Client initialization started'))
  .catch(err => {
    console.error('Failed to initialize:', err.message);
    isInitializing = false;
  });

// --------- Cleanup ----------
setInterval(() => {
  try {
    const files = fs.readdirSync(MEDIA_DIR);
    let deleted = 0;
    const now = Date.now();

    files.forEach(file => {
      try {
        const filePath = path.join(MEDIA_DIR, file);
        const stats = fs.statSync(filePath);
        const age = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        if (age > 15) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (e) {}
    });

    if (deleted > 0) console.log(`🧹 Deleted ${deleted} old media files`);
  } catch (err) {}
}, 1000 * 60 * 60 * 12);

// --------- Shutdown ----------
async function shutdown(signal) {
  console.log(`Received ${signal}. Shutting down...`);
  isClientReady = false;
  broadcastToClients('server_shutdown', { reason: signal });
  
  try { await client.destroy(); } catch (e) {}
  
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
