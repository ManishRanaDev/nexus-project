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
  // Add ping/pong for keeping connection alive
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
let messageCache = []; // Cache messages in memory
const MAX_CACHE_SIZE = 100;
let connectedClients = new Set(); // Track connected clients

// Create client with more stable Puppeteer settings
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

// --------- Helper functions ----------
function safeFilename(ext = 'bin') {
  mediaCounter = (mediaCounter + 1) % 10000;
  return `media_${Date.now()}_${mediaCounter}.${ext}`;
}

function clientIsReady() {
  return !!(client && client.info && client.info.wid && isClientReady);
}

function addToCache(message) {
  // Check if message already exists (by timestamp and body)
  const exists = messageCache.some(m =>
    m.timestamp === message.timestamp &&
    m.body === message.body &&
    m.from === message.from
  );

  if (!exists) {
    messageCache.unshift(message);
    // Keep cache size limited
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

    // Broadcast cached messages to all clients
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
    connectedClients: connectedClients.size
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
  console.log('✅ Authenticated');
  latestQR = null;
});

client.on('auth_failure', (msg) => {
  console.error('❌ Auth failed:', msg);
  broadcastToClients('auth_failure', { error: msg });
});

client.on('ready', async () => {
  try {
    isClientReady = true;
    console.log('✅ WhatsApp client is ready!');
    broadcastToClients('ready', { status: 'connected' });

    // Load initial messages
    try {
      console.log('📥 Loading initial messages...');
      const targetChat = await client.getChatById(TARGET_CONTACT);
      if (targetChat) {
        const messages = await targetChat.fetchMessages({ limit: 50 });
        console.log(`Loaded ${messages.length} initial messages`);

        // Process messages in chronological order
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
              console.warn('Media download failed:', mErr.message);
            }
          }

          const payload = {
            from: msg.from,
            to: msg.to,
            body: msg.body,
            timestamp: msg.timestamp,
            mediaUrl,
            mimetype: msg._data?.mimetype || null
          };

          addToCache(payload);
        }

        console.log(`✅ Cached ${messageCache.length} messages`);

        // Broadcast all cached messages to connected clients
        console.log('📡 Broadcasting initial messages to all clients...');
        messageCache.slice().reverse().forEach(msg => {
          broadcastToClients('message', msg);
        });
      }
    } catch (err) {
      console.warn('Could not load initial messages:', err.message);
      console.log('Will rely on live message handling');
    }
  } catch (err) {
    console.error('Error in ready handler:', err.stack);
  }
});

// ✅ CRITICAL: Real-time message handler
client.on('message', async (msg) => {
  try {
    if (msg.from === TARGET_CONTACT || msg.to === TARGET_CONTACT) {
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
          console.warn('Failed to download media:', mErr.message);
        }
      }

      const direction = msg.fromMe ? '📤' : '📥';
      console.log(`${direction} [${msg.from}] ${msg.body || '[Media]'}`);

      const payload = {
        from: msg.from,
        to: msg.to,
        body: msg.body,
        timestamp: msg.timestamp,
        mediaUrl,
        mimetype: msg._data?.mimetype || null
      };

      // Add to cache
      const isNew = addToCache(payload);

      // ALWAYS broadcast to ALL connected clients for real-time sync
      if (isNew) {
        console.log(`📡 Broadcasting new message to ${connectedClients.size} clients`);
        broadcastToClients('message', payload);
      }
    }
    if (
      !msg.fromMe &&
      deviceTokens.size > 0 &&
      (msg.from === TARGET_CONTACT || msg.to === TARGET_CONTACT)
    ) {
      sendPush(
        [...deviceTokens],
        {
          title: 'Nexus Terminal',
          body: getStealthNotification(),
          data: {
            type: 'incoming_signal',
            ts: String(msg.timestamp),
          },
        },
        (deadToken) => {
          deviceTokens.delete(deadToken);
          saveDeviceTokens();
        }
      ).catch(err => {
        console.error('Push failed:', err.message);
      });
    }
  } catch (err) {
    console.error('Error handling incoming message:', err.stack);
  }
});

client.on('message_create', async (msg) => {
  // This event fires for messages we send
  try {
    if (msg.to === TARGET_CONTACT && msg.fromMe) {
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
        console.log(`📤 Broadcasting sent message to ${connectedClients.size} clients`);
        broadcastToClients('message', payload);
      }
    }
  } catch (err) {
    console.error('Error in message_create handler:', err.message);
  }
});

client.on('disconnected', (reason) => {
  console.error('❌ WhatsApp disconnected:', reason);
  isClientReady = false;
  broadcastToClients('disconnected', { reason });

  // Clear cache on disconnect
  messageCache = [];

  setTimeout(() => {
    try {
      console.log(`Attempting to re-initialize after ${RECONNECT_DELAY_MS}ms...`);
      client.initialize().catch(e => console.error('Re-init failed:', e.stack));
    } catch (e) {
      console.error('Error scheduling re-initialize:', e.stack);
    }
  }, RECONNECT_DELAY_MS);
});

client.on('change_state', (state) => {
  console.log('📶 State changed:', state);
  broadcastToClients('state_change', { state });
});

client.on('error', (err) => {
  console.error('Client error event:', err.stack);
});

// --------- Socket.IO ----------
io.on('connection', (socket) => {
  connectedClients.add(socket.id);
  console.log(`🔌 Client connected [${socket.id}] - Total: ${connectedClients.size}`);

  // Send current status
  if (clientIsReady()) {
    socket.emit('ready', { status: 'connected' });

    // Send all cached messages to newly connected client
    if (messageCache.length > 0) {
      console.log(`📤 Sending ${messageCache.length} cached messages to new client`);
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
      console.error('❌ Send failed: client not ready');
      return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
    }

    try {
      console.log(`📤 Sending: "${message}" to ${TARGET_CONTACT}`);

      await client.sendMessage(TARGET_CONTACT, message, { sendSeen: false });

      // Create payload for sent message
      const payload = {
        from: client.info.wid?._serialized || 'me',
        to: TARGET_CONTACT,
        body: message,
        timestamp: Date.now(),
        mediaUrl: null,
        mimetype: null
      };

      // Add to cache
      const isNew = addToCache(payload);

      // Broadcast to all clients immediately
      if (isNew) {
        console.log(`📡 Broadcasting sent message to ${connectedClients.size} clients`);
        broadcastToClients('message', payload);
      }

      console.log(`✅ Message sent successfully`);
      socket.emit('send_result', { ok: true });

    } catch (err) {
      console.error('❌ Send failed:', err.stack);
      socket.emit('send_result', { ok: false, error: String(err.message) });
    }
  });

  socket.on('send_media', async ({ base64, mimetype, filename }) => {
    if (!clientIsReady()) {
      console.error('❌ Send media failed: client not ready');
      return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
    }

    try {
      const base64Body = base64.includes(',') ? base64.split(',')[1] : base64;
      const media = new MessageMedia(mimetype, base64Body, filename);

      console.log(`📤 Sending media: ${filename} to ${TARGET_CONTACT}`);
      await client.sendMessage(TARGET_CONTACT, media, { sendSeen: false });

      const payload = {
        from: client.info.wid?._serialized || 'me',
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

      console.log(`✅ Media sent successfully`);
      socket.emit('send_result', { ok: true });

    } catch (err) {
      console.error('❌ Send media failed:', err.stack);
      socket.emit('send_result', { ok: false, error: String(err.message) });
    }
  });
});

// --------- Start server & initialize client ----------
const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => {
  console.log(`🚀 Backend running on http://localhost:${PORT}`);
  console.log(`📱 Target contact: ${TARGET_CONTACT}`);
});

client.initialize().catch(err => {
  console.error('Failed to initialize WhatsApp client:', err.stack);
});

// --------- Periodic cleanup ----------
setInterval(() => {
  try {
    const now = Date.now();
    const files = fs.readdirSync(MEDIA_DIR);
    let deletedCount = 0;

    files.forEach(file => {
      try {
        const filePath = path.join(MEDIA_DIR, file);
        const stats = fs.statSync(filePath);
        const age = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        if (age > 15) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (e) {
        console.warn('Error cleaning file', file, e.message);
      }
    });

    if (deletedCount > 0) {
      console.log(`🧹 Deleted ${deletedCount} old media files`);
    }
  } catch (err) {
    console.error('Error in media cleanup:', err.message);
  }
}, 1000 * 60 * 60 * 12);

// --------- Graceful shutdown ----------
async function shutdown(signal) {
  try {
    console.log(`Received ${signal}. Shutting down...`);
    isClientReady = false;

    // Notify all clients
    broadcastToClients('server_shutdown', { reason: signal });

    try { await client.destroy(); } catch (e) { /* ignore */ }

    server.close(() => {
      console.log('Server closed.');
      process.exit(0);
    });

    setTimeout(() => {
      console.warn('Forcing shutdown.');
      process.exit(1);
    }, 5000);
  } catch (err) {
    console.error('Error during shutdown:', err.stack);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
