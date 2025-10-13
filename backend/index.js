require('dotenv').config();
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const TARGET_CONTACT = '918299515901@c.us';
const MEDIA_DIR = path.join(__dirname, 'public');
const BASE_URL = process.env.PUBLIC_URL || 'http://localhost:3001';

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(MEDIA_DIR));

let latestQR = null;
let isReady = false;

// Helper to safely create a unique filename
function makeFilename(ext = 'bin') {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `media_${ts}_${rand}.${ext}`;
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--single-process',
      '--disable-dev-shm-usage'
    ]
  }
});

/**
 * Health endpoint:
 * - connected  => client is initialized and ready
 * - qr_required => we have a QR waiting to be scanned
 * - disconnected => neither of the above
 */
app.get('/health', (req, res) => {
  const state = isReady ? 'connected' : (latestQR ? 'qr_required' : 'disconnected');
  res.status(200).json({ status: state });
});

/**
 * Sync messages for TARGET_CONTACT
 * - Waits up to 10s for the client to be ready (checks every 500ms)
 * - Safely handles media download failures
 * - Emits each message via socket.io and returns a JSON summary
 */
app.get('/sync-messages', async (req, res) => {
  const waitForReady = async (timeoutMs = 10000) => {
    const start = Date.now();
    while (!isReady && (Date.now() - start) < timeoutMs) {
      await new Promise(r => setTimeout(r, 500));
    }
    return isReady;
  };

  try {
    const ready = await waitForReady(10000);
    if (!ready) {
      console.warn('Sync aborted: WhatsApp client not ready');
      return res.status(503).json({ error: 'WhatsApp client not ready. Try again in a few seconds.' });
    }

    const chats = await client.getChats();
    const synced = [];

    for (const chat of chats) {
      const messages = await chat.fetchMessages({ limit: 100 });
      for (const msg of messages) {
        if (msg.from === TARGET_CONTACT || msg.to === TARGET_CONTACT) {
          let mediaUrl = null;

          if (msg.hasMedia) {
            try {
              const media = await msg.downloadMedia();
              if (media && media.data) {
                const buffer = Buffer.from(media.data, 'base64');
                const ext = (media.mimetype || 'application/octet-stream').split('/')[1] || 'bin';
                const filename = makeFilename(ext);
                const filepath = path.join(MEDIA_DIR, filename);
                fs.writeFileSync(filepath, buffer);
                mediaUrl = `${BASE_URL}/media/${filename}`;
              }
            } catch (mediaErr) {
              console.warn('Failed to download media for a message:', mediaErr?.message || mediaErr);
              // continue without media
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
    }

    res.status(200).json({ message: 'Messages synced', count: synced.length });
  } catch (err) {
    console.error('❌ Sync failed:', err && (err.stack || err.message || err));
    res.status(500).json({ error: 'Sync failed', detail: err?.message || String(err) });
  }
});

client.on('qr', (qr) => {
  latestQR = qr;
  isReady = false;
  console.log('QR RECEIVED');
  qrcode.generate(qr, { small: true });
  io.emit('qr', qr);
});

client.on('authenticated', () => {
  console.log('✅ Authenticated');
});

client.on('auth_failure', (err) => {
  console.error('❌ Auth failed', err || '');
});

client.on('ready', async () => {
  isReady = true;
  latestQR = null;
  console.log('✅ WhatsApp client is ready!');
  io.emit('ready');

  // emit recent messages for the target contact
  try {
    const chats = await client.getChats();
    for (const chat of chats) {
      const messages = await chat.fetchMessages({ limit: 100 });
      for (const msg of messages) {
        if (msg.from === TARGET_CONTACT || msg.to === TARGET_CONTACT) {
          let mediaUrl = null;
          if (msg.hasMedia) {
            try {
              const media = await msg.downloadMedia();
              if (media && media.data) {
                const buffer = Buffer.from(media.data, 'base64');
                const ext = (media.mimetype || 'application/octet-stream').split('/')[1] || 'bin';
                const filename = makeFilename(ext);
                const filepath = path.join(MEDIA_DIR, filename);
                fs.writeFileSync(filepath, buffer);
                mediaUrl = `${BASE_URL}/media/${filename}`;
              }
            } catch (mediaErr) {
              console.warn('Failed to download media during ready sync:', mediaErr?.message || mediaErr);
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
    }
  } catch (err) {
    console.warn('Error while emitting past messages on ready:', err?.message || err);
  }
});

client.on('disconnected', (reason) => {
  console.error('❌ WhatsApp disconnected:', reason);
  isReady = false;
  io.emit('disconnected', reason);
  // let the library handle reconnection; avoid aggressive client.initialize() calls
});

client.on('change_state', state => console.log('📶 State changed:', state));

client.on('message', async (msg) => {
  try {
    if (msg.from === TARGET_CONTACT || msg.to === TARGET_CONTACT) {
      let mediaUrl = null;
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media && media.data) {
            const buffer = Buffer.from(media.data, 'base64');
            const ext = (media.mimetype || 'application/octet-stream').split('/')[1] || 'bin';
            const filename = makeFilename(ext);
            const filepath = path.join(MEDIA_DIR, filename);
            fs.writeFileSync(filepath, buffer);
            mediaUrl = `${BASE_URL}/media/${filename}`;
          }
        } catch (mediaErr) {
          console.warn('Failed to download incoming media:', mediaErr?.message || mediaErr);
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
    console.error('Error handling incoming message:', err?.message || err);
  }
});

io.on('connection', (socket) => {
  console.log('🔌 Frontend connected');

  if (isReady && client.info?.wid) socket.emit('ready');
  else if (latestQR) socket.emit('qr', latestQR);

  socket.on('request_status', () => {
    if (isReady && client.info?.wid) socket.emit('ready');
    else if (latestQR) socket.emit('qr', latestQR);
  });

  socket.on('send_message', async ({ message }) => {
    try {
      await client.sendMessage(TARGET_CONTACT, message);
      console.log(`📤 Sent to ${TARGET_CONTACT}: ${message}`);
    } catch (err) {
      console.error('❌ Failed to send:', err?.message || err);
    }
  });

  socket.on('send_media', async ({ base64, mimetype, filename }) => {
    try {
      // base64 may be "data:[mimetype];base64,xxxxx" - split if needed
      const raw = base64.includes(',') ? base64.split(',')[1] : base64;
      const media = new MessageMedia(mimetype, raw, filename);
      await client.sendMessage(TARGET_CONTACT, media);
      io.emit('message', {
        from: client.info?.wid?._serialized || 'me',
        to: TARGET_CONTACT,
        body: '',
        timestamp: Date.now(),
        mediaUrl: null,
        mimetype
      });
      console.log(`📤 Sent media to ${TARGET_CONTACT}: ${filename}`);
    } catch (err) {
      console.error('❌ Failed to send media:', err?.message || err);
    }
  });
});

client.initialize().catch(err => {
  console.error('Failed to initialize WhatsApp client:', err?.message || err);
});

app.get('/', (req, res) => res.send('Nexus Backend Running'));

server.listen(3001, () => console.log('🚀 Backend running on http://localhost:3001'));

// periodic cleanup of old media files older than 15 days
setInterval(() => {
  try {
    const now = Date.now();
    const files = fs.readdirSync(MEDIA_DIR);
    files.forEach(file => {
      const filePath = path.join(MEDIA_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        const age = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
        if (age > 15) {
          fs.unlinkSync(filePath);
          console.log(`🧹 Deleted old media: ${file}`);
        }
      } catch (e) {
        // ignore per-file errors
      }
    });
  } catch (e) {
    console.warn('Media cleanup failed:', e?.message || e);
  }
}, 1000 * 60 * 60 * 12);
