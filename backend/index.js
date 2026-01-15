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
const RECONNECT_DELAY_MS = parseInt(process.env.RECONNECT_DELAY_MS || '5000', 10);

if (!fs.existsSync(MEDIA_DIR)) fs.mkdirSync(MEDIA_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(MEDIA_DIR));

let mediaCounter = 0;
let latestQR = null;
let isClientReady = false;

// Create client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--single-process',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote'
    ]
  }
});

// --------- Helper functions ----------
function safeFilename(ext = 'bin') {
  mediaCounter = (mediaCounter + 1) % 10000;
  return `media_${Date.now()}_${mediaCounter}.${ext}`;
}

function clientIsReady() {
  // client.info?.wid is a good indicator of an authenticated session
  return !!(client && client.info && client.info.wid && isClientReady);
}

async function safeGetChats() {
  if (!clientIsReady()) throw new Error('WhatsApp client not ready');
  return client.getChats();
}

// --------- HTTP routes ----------
app.get('/health', (req, res) => {
  if (clientIsReady()) {
    res.status(200).json({ status: 'connected' });
  } else if (latestQR) {
    res.status(200).json({ status: 'qr_required' });
  } else {
    res.status(200).json({ status: 'disconnected' });
  }
});

app.get('/sync-messages', async (req, res) => {
  if (!clientIsReady()) {
    console.error('Sync aborted: WhatsApp client not ready');
    return res.status(503).json({ error: 'WhatsApp client not ready' });
  }

  try {
    const chats = await safeGetChats();
    const synced = [];

    for (const chat of chats) {
      // try-catch each chat so one bad chat doesn't abort the whole loop
      try {
        const messages = await chat.fetchMessages({ limit: 100 });
        for (const msg of messages) {
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
                console.error('Failed downloading media for a message:', mErr && mErr.stack ? mErr.stack : mErr);
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

            io.emit('message', payload);
            synced.push(payload);
          }
        }
      } catch (chatErr) {
        console.warn(`Failed processing chat ${chat.id?.serialized || chat.id}:`, chatErr && chatErr.message ? chatErr.message : chatErr);
      }
    }

    res.status(200).json({ message: 'Messages synced', count: synced.length });
  } catch (err) {
    console.error('❌ Sync failed:', err && err.stack ? err.stack : err);
    res.status(500).json({ error: 'Sync failed', detail: String(err && err.message ? err.message : err) });
  }
});

// (Optional) quick debug info - remove in production if you don't want to expose info
app.get('/debug-info', (req, res) => {
  res.json({
    ready: clientIsReady(),
    info: client.info || null,
    latestQR: !!latestQR
  });
});

// Test endpoint for debugging
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

// --------- Client events ----------
client.on('qr', (qr) => {
  latestQR = qr;
  isClientReady = false;
  console.log('QR RECEIVED');
  qrcode.generate(qr, { small: true });
  io.emit('qr', qr);
});

client.on('authenticated', () => {
  console.log('✅ Authenticated');
  latestQR = null;
});

client.on('auth_failure', (msg) => {
  console.error('❌ Auth failed:', msg);
});

client.on('ready', async () => {
  try {
    isClientReady = true;
    console.log('✅ WhatsApp client is ready!');
    io.emit('ready');

    // Emit recent messages from target contact (best-effort)
    try {
      const chats = await safeGetChats();
      for (const chat of chats) {
        try {
          const messages = await chat.fetchMessages({ limit: 100 });
          for (const msg of messages) {
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
                  console.warn('media download in ready handler failed:', mErr && mErr.message ? mErr.message : mErr);
                }
              }

              io.emit('message', {
                from: msg.from,
                to: msg.to,
                body: msg.body,
                timestamp: msg.timestamp,
                mediaUrl,
                mimetype: msg._data?.mimetype || null
              });
            }
          }
        } catch (cErr) {
          // continue with next chat
          console.warn('Error fetching messages for a chat during ready handler:', cErr && cErr.message ? cErr.message : cErr);
        }
      }
    } catch (err) {
      console.warn('Could not fetch chats in ready handler:', err && err.message ? err.message : err);
    }
  } catch (err) {
    console.error('Error in ready handler:', err && err.stack ? err.stack : err);
  }
});

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
          console.warn('Failed to download media for inbound message:', mErr && mErr.message ? mErr.message : mErr);
        }
      }

      console.log(`📥 [${msg.from}] ${msg.body}`);
      io.emit('message', {
        from: msg.from,
        to: msg.to,
        body: msg.body,
        timestamp: msg.timestamp,
        mediaUrl,
        mimetype: msg._data?.mimetype || null
      });
    }
  } catch (err) {
    console.error('Error handling incoming message:', err && err.stack ? err.stack : err);
  }
});

client.on('disconnected', (reason) => {
  console.error('❌ WhatsApp disconnected:', reason);
  isClientReady = false;
  io.emit('disconnected', reason);

  // Avoid spamming initialize calls — do a delayed reconnect
  setTimeout(() => {
    try {
      console.log(`Attempting to re-initialize client after ${RECONNECT_DELAY_MS}ms...`);
      client.initialize().catch(e => console.error('Re-init failed:', e && e.stack ? e.stack : e));
    } catch (e) {
      console.error('Error scheduling re-initialize:', e && e.stack ? e.stack : e);
    }
  }, RECONNECT_DELAY_MS);
});

client.on('change_state', (state) => {
  console.log('📶 State changed:', state);
});

// Generic error logging for client internals (best-effort)
client.on('error', (err) => {
  console.error('Client error event:', err && err.stack ? err.stack : err);
});

// --------- Socket.IO ----------
io.on('connection', (socket) => {
  console.log('🔌 Frontend connected');

  if (clientIsReady()) socket.emit('ready');
  else if (latestQR) socket.emit('qr', latestQR);

  socket.on('request_status', () => {
    if (clientIsReady()) socket.emit('ready');
    else if (latestQR) socket.emit('qr', latestQR);
    else socket.emit('disconnected');
  });

  // ✅ FIXED: Added { sendSeen: false } to bypass WhatsApp Web API breaking change
  socket.on('send_message', async ({ message }) => {
    if (!clientIsReady()) {
      console.error('Attempt to send message while client not ready');
      return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
    }
    try {
      console.log(`📤 Attempting to send to ${TARGET_CONTACT}: ${message}`);
      
      // Send message without sendSeen to avoid WhatsApp Web API issue
      await client.sendMessage(TARGET_CONTACT, message, { sendSeen: false });
      
      console.log(`✅ Sent successfully to ${TARGET_CONTACT}: ${message}`);
      socket.emit('send_result', { ok: true });
    } catch (err) {
      console.error('❌ Failed to send:', err && err.stack ? err.stack : err);
      socket.emit('send_result', { ok: false, error: String(err && err.message ? err.message : err) });
    }
  });

  // ✅ FIXED: Added { sendSeen: false } for media sending too
  socket.on('send_media', async ({ base64, mimetype, filename }) => {
    if (!clientIsReady()) {
      console.error('Attempt to send media while client not ready');
      return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
    }
    try {
      const base64Body = base64.includes(',') ? base64.split(',')[1] : base64;
      const media = new MessageMedia(mimetype, base64Body, filename);
      
      // Send media without sendSeen to avoid WhatsApp Web API issue
      await client.sendMessage(TARGET_CONTACT, media, { sendSeen: false });

      io.emit('message', {
        from: client.info.wid?._serialized || null,
        to: TARGET_CONTACT,
        body: '',
        timestamp: Date.now(),
        mediaUrl: null,
        mimetype
      });

      console.log(`📤 Sent media to ${TARGET_CONTACT}: ${filename}`);
      socket.emit('send_result', { ok: true });
    } catch (err) {
      console.error('❌ Failed to send media:', err && err.stack ? err.stack : err);
      socket.emit('send_result', { ok: false, error: String(err && err.message ? err.message : err) });
    }
  });
});

// --------- Start server & initialize client ----------
const PORT = parseInt(process.env.PORT || '3001', 10);
server.listen(PORT, () => console.log(`🚀 Backend running on http://localhost:${PORT}`));

// initialize client and catch top-level initialization errors
client.initialize().catch(err => {
  console.error('Failed to initialize WhatsApp client:', err && err.stack ? err.stack : err);
});

// --------- Periodic cleanup ----------
setInterval(() => {
  try {
    const now = Date.now();
    const files = fs.readdirSync(MEDIA_DIR);
    files.forEach(file => {
      try {
        const filePath = path.join(MEDIA_DIR, file);
        const stats = fs.statSync(filePath);
        const age = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24); // days
        if (age > 15) {
          fs.unlinkSync(filePath);
          console.log(`🧹 Deleted old media: ${file}`);
        }
      } catch (e) {
        console.warn('Error while cleaning media file', file, e && e.message ? e.message : e);
      }
    });
  } catch (err) {
    console.error('Error in media cleanup interval:', err && err.stack ? err.stack : err);
  }
}, 1000 * 60 * 60 * 12); // every 12 hours

// --------- Graceful shutdown ----------
async function shutdown(signal) {
  try {
    console.log(`Received ${signal}. Shutting down server...`);
    isClientReady = false;
    try { await client.destroy(); } catch (e) { /* ignore errors on destroy */ }
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
    // force exit after 5s
    setTimeout(() => {
      console.warn('Forcing shutdown.');
      process.exit(1);
    }, 5000);
  } catch (err) {
    console.error('Error during shutdown:', err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
