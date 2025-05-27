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
app.get('/sync-messages', async (req, res) => {
  try {
    const chats = await client.getChats();
    const synced = [];

    for (const chat of chats) {
      const messages = await chat.fetchMessages({ limit: 100 });
      for (const msg of messages) {
        if (msg.from === TARGET_CONTACT || msg.to === TARGET_CONTACT) {
          let mediaUrl = null;
          if (msg.hasMedia) {
            const media = await msg.downloadMedia();
            if (media) {
              const buffer = Buffer.from(media.data, 'base64');
              const ext = media.mimetype.split('/')[1];
              const filename = `media_${Date.now()}.${ext}`;
              const filepath = path.join(MEDIA_DIR, filename);
              fs.writeFileSync(filepath, buffer);
              mediaUrl = `${BASE_URL}/media/${filename}`;
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
    console.error('❌ Sync failed:', err.message);
    res.status(500).json({ error: 'Sync failed' });
  }
});

let latestQR = null;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process', '--disable-dev-shm-usage']
  }
});

client.on('qr', (qr) => {
  latestQR = qr;
  console.log('QR RECEIVED');
  qrcode.generate(qr, { small: true });
  io.emit('qr', qr);
});

client.on('ready', async () => {
  console.log('✅ WhatsApp client is ready!');
  io.emit('ready');

  const chats = await client.getChats();
  for (const chat of chats) {
    const messages = await chat.fetchMessages({ limit: 100 });
    for (const msg of messages) {
      if (msg.from === TARGET_CONTACT || msg.to === TARGET_CONTACT) {
        let mediaUrl = null;
        if (msg.hasMedia) {
          const media = await msg.downloadMedia();
          if (media) {
            const buffer = Buffer.from(media.data, 'base64');
            const ext = media.mimetype.split('/')[1];
            const filename = `media_${Date.now()}.${ext}`;
            const filepath = path.join(MEDIA_DIR, filename);
            fs.writeFileSync(filepath, buffer);
            mediaUrl = `${BASE_URL}/media/${filename}`;
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
});

client.on('message', async (msg) => {
  if (msg.from === TARGET_CONTACT || msg.to === TARGET_CONTACT) {
    let mediaUrl = null;
    if (msg.hasMedia) {
      const media = await msg.downloadMedia();
      if (media) {
        const buffer = Buffer.from(media.data, 'base64');
        const ext = media.mimetype.split('/')[1];
        const filename = `media_${Date.now()}.${ext}`;
        const filepath = path.join(MEDIA_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        mediaUrl = `${BASE_URL}/media/${filename}`;
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
});

io.on('connection', (socket) => {
  console.log('🔌 Frontend connected');

  if (client.info?.wid) socket.emit('ready');
  else if (latestQR) socket.emit('qr', latestQR);

  socket.on('request_status', () => {
    if (client.info?.wid) socket.emit('ready');
    else if (latestQR) socket.emit('qr', latestQR);
  });

  socket.on('send_message', async ({ message }) => {
    try {
      await client.sendMessage(TARGET_CONTACT, message);
      console.log(`📤 Sent to ${TARGET_CONTACT}: ${message}`);
    } catch (err) {
      console.error('❌ Failed to send:', err.message);
    }
  });

  socket.on('send_media', async ({ base64, mimetype, filename }) => {
    try {
      const media = new MessageMedia(mimetype, base64.split(',')[1], filename);
      await client.sendMessage(TARGET_CONTACT, media);
      io.emit('message', {
        from: client.info.wid._serialized,
        to: TARGET_CONTACT,
        body: '',
        timestamp: Date.now(),
        mediaUrl: null,
        mimetype
      });
      console.log(`📤 Sent media to ${TARGET_CONTACT}: ${filename}`);
    } catch (err) {
      console.error('❌ Failed to send media:', err.message);
    }
  });
});

client.initialize();

app.get('/', (req, res) => res.send('Nexus Backend Running'));

server.listen(3001, () => console.log('🚀 Backend running on http://localhost:3001'));

setInterval(() => {
  const now = Date.now();
  const files = fs.readdirSync(MEDIA_DIR);
  files.forEach(file => {
    const filePath = path.join(MEDIA_DIR, file);
    const stats = fs.statSync(filePath);
    const age = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    if (age > 15) {
      fs.unlinkSync(filePath);
      console.log(`🧹 Deleted old media: ${file}`);
    }
  });
}, 1000 * 60 * 60 * 12);
