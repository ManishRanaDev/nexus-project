/**
 * Nexus Terminal Backend v2.0
 * WhatsApp Integration Server with Socket.IO Real-time Communication
 */

'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  port: parseInt(process.env.PORT || '3001', 10),
  targetContact: process.env.TARGET_CONTACT || '918299515901@c.us',
  baseUrl: process.env.PUBLIC_URL || 'http://localhost:3001',
  mediaDir: path.join(__dirname, 'public'),
  tokensFile: path.join(__dirname, 'deviceTokens.json'),
  maxCacheSize: 100,
  maxReconnectAttempts: 3,
  reconnectDelayMs: 5000,
  mediaRetentionDays: 15,
  clientStabilizationDelayMs: 8000,
  messageLoadDelayMs: 3000,
};

// Stealth notification messages for push notifications
const STEALTH_MESSAGES = [
  'New event received',
  'Background task completed',
  'Secure channel activity',
  'Input stream updated',
  'Signal received',
  'Remote task executed',
  'System update detected',
  'New log entry created',
  'Process completed successfully',
];

// ============================================================================
// Utility Functions
// ============================================================================

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = { info: 'ℹ️', warn: '⚠️', error: '❌', success: '✅', debug: '🔍' }[level] || '📋';
  console.log(`[${timestamp}] ${prefix} ${message}`, data ? JSON.stringify(data) : '');
}

function getRandomStealthMessage() {
  return STEALTH_MESSAGES[Math.floor(Math.random() * STEALTH_MESSAGES.length)];
}

function generateMediaFilename(extension = 'bin') {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `media_${timestamp}_${random}.${extension}`;
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log('info', `Created directory: ${dirPath}`);
  }
}

// ============================================================================
// Device Token Management
// ============================================================================

class DeviceTokenManager {
  constructor(filePath) {
    this.filePath = filePath;
    this.tokens = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        return new Set(JSON.parse(data));
      }
    } catch (err) {
      log('warn', 'Failed to load device tokens', { error: err.message });
    }
    return new Set();
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify([...this.tokens], null, 2));
    } catch (err) {
      log('error', 'Failed to save device tokens', { error: err.message });
    }
  }

  add(token) {
    if (!token || typeof token !== 'string') return false;
    const hadToken = this.tokens.has(token);
    this.tokens.add(token);
    if (!hadToken) {
      this.save();
      log('info', 'Device token registered', { tokenPrefix: token.slice(0, 12) });
    }
    return !hadToken;
  }

  remove(token) {
    if (this.tokens.delete(token)) {
      this.save();
      log('info', 'Device token removed', { tokenPrefix: token.slice(0, 12) });
      return true;
    }
    return false;
  }

  getAll() {
    return [...this.tokens];
  }

  get size() {
    return this.tokens.size;
  }
}

// ============================================================================
// Message Cache Manager
// ============================================================================

class MessageCache {
  constructor(maxSize = 100) {
    this.messages = [];
    this.maxSize = maxSize;
  }

  add(message) {
    // Check for duplicates
    const isDuplicate = this.messages.some(
      (m) =>
        m.timestamp === message.timestamp &&
        m.body === message.body &&
        m.from === message.from
    );

    if (isDuplicate) return false;

    this.messages.unshift(message);
    if (this.messages.length > this.maxSize) {
      this.messages = this.messages.slice(0, this.maxSize);
    }
    return true;
  }

  getAll() {
    return [...this.messages];
  }

  getReversed() {
    return [...this.messages].reverse();
  }

  clear() {
    this.messages = [];
  }

  get size() {
    return this.messages.length;
  }

  getInfo() {
    return {
      size: this.messages.length,
      maxSize: this.maxSize,
      oldest: this.messages[this.messages.length - 1]?.timestamp || null,
      newest: this.messages[0]?.timestamp || null,
    };
  }
}

// ============================================================================
// Push Notification Service
// ============================================================================

let pushService = null;

async function initializePushService() {
  try {
    const admin = require('firebase-admin');

    if (
      !process.env.FCM_PROJECT_ID ||
      !process.env.FCM_CLIENT_EMAIL ||
      !process.env.FCM_PRIVATE_KEY
    ) {
      log('warn', 'Firebase credentials not configured - push notifications disabled');
      return null;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FCM_PROJECT_ID,
          clientEmail: process.env.FCM_CLIENT_EMAIL,
          privateKey: process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    }

    log('success', 'Firebase Admin initialized successfully');
    return admin;
  } catch (err) {
    log('error', 'Failed to initialize Firebase', { error: err.message });
    return null;
  }
}

async function sendPushNotification(tokens, payload, onInvalidToken) {
  if (!pushService || !tokens.length) return;

  try {
    const response = await pushService.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title || 'Nexus Terminal',
        body: payload.body || getRandomStealthMessage(),
      },
      data: payload.data || {},
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'nexus_channel',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });

    let successCount = 0;
    response.responses.forEach((res, idx) => {
      if (res.success) {
        successCount++;
      } else if (
        res.error?.code === 'messaging/registration-token-not-registered' ||
        res.error?.code === 'messaging/invalid-registration-token'
      ) {
        if (typeof onInvalidToken === 'function') {
          onInvalidToken(tokens[idx]);
        }
      }
    });

    log('info', `Push notifications sent: ${successCount}/${tokens.length}`);
  } catch (err) {
    log('error', 'Push notification failed', { error: err.message });
  }
}

// ============================================================================
// WhatsApp Client Manager
// ============================================================================

class WhatsAppManager {
  constructor(config, messageCache, deviceTokens, broadcastFn) {
    this.config = config;
    this.messageCache = messageCache;
    this.deviceTokens = deviceTokens;
    this.broadcast = broadcastFn;

    this.client = null;
    this.isReady = false;
    this.isInitializing = false;
    this.latestQR = null;
    this.reconnectAttempts = 0;
    this.loadingTimeout = null;
    this.readyTimeout = null;
  }

  getPuppeteerConfig() {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-translate',
      '--disable-sync',
      '--hide-scrollbars',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-default-browser-check',
      '--safebrowsing-disable-auto-update',
    ];

    // Single process mode for low-memory environments
    if (process.env.LOW_MEMORY === 'true') {
      args.push('--single-process');
    }

    // Find Chrome/Chromium executable
    const possiblePaths = [
      process.env.CHROME_PATH,
      process.env.PUPPETEER_EXECUTABLE_PATH,
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);

    let executablePath = null;
    for (const p of possiblePaths) {
      if (p && fs.existsSync(p)) {
        executablePath = p;
        log('info', `Using Chrome at: ${p}`);
        break;
      }
    }

    const config = {
      headless: true,
      args,
      defaultViewport: null,
      timeout: 60000,
    };

    if (executablePath) {
      config.executablePath = executablePath;
    }

    return config;
  }

  createClient() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'nexus-client',
        dataPath: path.join(__dirname, '.wwebjs_auth'),
      }),
      puppeteer: this.getPuppeteerConfig(),
      webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/AhmadBilal-WebDev/pptr_wawebcache/main/webVersionCache.json',
      },
    });

    this.setupEventHandlers();
    return this.client;
  }

  setupEventHandlers() {
    // QR Code Event
    this.client.on('qr', (qr) => {
      this.latestQR = qr;
      this.isReady = false;
      log('info', 'QR Code received');
      qrcode.generate(qr, { small: true });
      this.broadcast('qr', qr);
    });

    // Authentication Success
    this.client.on('authenticated', () => {
      log('success', 'Authentication successful');
      this.latestQR = null;
      this.broadcast('authenticated', { status: 'authenticated' });

      // Fallback: Force ready if stuck after authentication
      this.readyTimeout = setTimeout(() => {
        if (!this.isReady && this.client?.info) {
          log('warn', 'Forcing ready event after authentication timeout');
          this.handleReady();
        }
      }, 20000);
    });

    // Authentication Failure
    this.client.on('auth_failure', (msg) => {
      log('error', 'Authentication failed', { message: msg });
      this.isInitializing = false;
      this.broadcast('auth_failure', { error: msg });
    });

    // Loading Screen
    this.client.on('loading_screen', (percent, message) => {
      log('debug', `Loading: ${percent}% - ${message}`);
      this.broadcast('loading', { percent, message });

      // If stuck at 100%, force ready
      if (percent === 100 && !this.isReady) {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = setTimeout(() => {
          if (!this.isReady && this.client?.info) {
            log('warn', 'Forcing ready event (stuck at 100%)');
            this.handleReady();
          }
        }, 5000);
      }
    });

    // Ready Event
    this.client.on('ready', () => {
      clearTimeout(this.readyTimeout);
      clearTimeout(this.loadingTimeout);
      this.handleReady();
    });

    // Incoming Messages
    this.client.on('message', async (msg) => {
      await this.handleIncomingMessage(msg);
    });

    // Sent Messages
    this.client.on('message_create', async (msg) => {
      await this.handleSentMessage(msg);
    });

    // Disconnection
    this.client.on('disconnected', (reason) => {
      log('error', 'WhatsApp disconnected', { reason });
      this.isReady = false;
      this.isInitializing = false;
      this.latestQR = null;
      this.broadcast('disconnected', { reason });
      this.attemptReconnect();
    });

    // State Changes
    this.client.on('change_state', (state) => {
      log('debug', 'State changed', { state });
      this.broadcast('state_change', { state });
    });

    // Errors
    this.client.on('error', (err) => {
      log('error', 'Client error', { error: err.message });
    });
  }

  async handleReady() {
    if (this.isReady) return; // Prevent duplicate handling

    log('success', '🎉 WhatsApp Client Ready!');
    this.isReady = true;
    this.isInitializing = false;
    this.reconnectAttempts = 0;
    this.latestQR = null;

    const clientInfo = {
      pushname: this.client.info?.pushname || 'User',
      phone: this.client.info?.wid?._serialized || 'Unknown',
    };

    log('info', 'Connected as', clientInfo);
    this.broadcast('ready', { status: 'connected', info: clientInfo });

    // Load message history after stabilization
    setTimeout(() => this.loadMessageHistory(), this.config.clientStabilizationDelayMs);
  }

  async loadMessageHistory() {
    try {
      log('info', 'Loading message history...');

      // Wait for client to fully stabilize
      await new Promise((resolve) => setTimeout(resolve, this.config.messageLoadDelayMs));

      if (!this.isReady) {
        log('warn', 'Client not ready, skipping message history load');
        return;
      }

      const chats = await this.client.getChats();
      log('info', `Found ${chats.length} chats`);

      const targetChat = chats.find(
        (chat) => chat.id._serialized === this.config.targetContact
      );

      if (!targetChat) {
        log('info', 'Target chat not found - will populate as messages arrive');
        return;
      }

      log('info', 'Target chat found, loading messages...');

      const messages = await targetChat.fetchMessages({ limit: 30 });
      log('info', `Loaded ${messages.length} messages from history`);

      for (const msg of messages.reverse()) {
        try {
          const payload = await this.createMessagePayload(msg);
          if (payload && this.messageCache.add(payload)) {
            this.broadcast('message', payload);
          }
        } catch (err) {
          log('warn', 'Failed to process historical message', { error: err.message });
        }
      }

      log('success', `Message cache populated with ${this.messageCache.size} messages`);
    } catch (err) {
      log('error', 'Failed to load message history', { error: err.message });
      log('info', 'Real-time messaging will still work');
    }
  }

  async createMessagePayload(msg) {
    let mediaUrl = null;
    let mimetype = msg._data?.mimetype || null;

    if (msg.hasMedia) {
      try {
        const media = await msg.downloadMedia();
        if (media?.data) {
          const buffer = Buffer.from(media.data, 'base64');
          const ext = media.mimetype?.split('/')[1]?.split(';')[0] || 'bin';
          const filename = generateMediaFilename(ext);
          const filePath = path.join(this.config.mediaDir, filename);
          fs.writeFileSync(filePath, buffer);
          mediaUrl = `${this.config.baseUrl}/media/${filename}`;
          mimetype = media.mimetype;
        }
      } catch (err) {
        log('warn', 'Media download failed', { error: err.message });
      }
    }

    return {
      from: msg.from,
      to: msg.to,
      body: msg.body || '',
      timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
      mediaUrl,
      mimetype,
    };
  }

  async handleIncomingMessage(msg) {
    try {
      const isTargetConversation =
        msg.from === this.config.targetContact || msg.to === this.config.targetContact;

      if (!isTargetConversation) return;

      log('info', 'Incoming message', { from: msg.from });

      const payload = await this.createMessagePayload(msg);
      if (!payload) return;

      const isNew = this.messageCache.add(payload);

      if (isNew) {
        this.broadcast('message', payload);

        // Send push notification for incoming messages
        if (!msg.fromMe && this.deviceTokens.size > 0) {
          sendPushNotification(
            this.deviceTokens.getAll(),
            {
              title: 'Nexus Terminal',
              body: getRandomStealthMessage(),
              data: { type: 'incoming_signal', ts: String(msg.timestamp) },
            },
            (deadToken) => this.deviceTokens.remove(deadToken)
          );
        }
      }
    } catch (err) {
      log('error', 'Error handling incoming message', { error: err.message });
    }
  }

  async handleSentMessage(msg) {
    try {
      if (msg.to !== this.config.targetContact || !msg.fromMe) return;

      const payload = {
        from: this.client.info?.wid?._serialized || 'me',
        to: msg.to,
        body: msg.body || '',
        timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
        mediaUrl: null,
        mimetype: null,
      };

      if (this.messageCache.add(payload)) {
        log('info', 'Sent message captured');
        this.broadcast('message', payload);
      }
    } catch (err) {
      log('error', 'Error handling sent message', { error: err.message });
    }
  }

  async sendMessage(text) {
    if (!this.isReady) {
      throw new Error('Client not ready');
    }

    await this.client.sendMessage(this.config.targetContact, text, { sendSeen: false });

    const payload = {
      from: this.client.info?.wid?._serialized || 'me',
      to: this.config.targetContact,
      body: text,
      timestamp: Math.floor(Date.now() / 1000),
      mediaUrl: null,
      mimetype: null,
    };

    if (this.messageCache.add(payload)) {
      this.broadcast('message', payload);
    }

    return payload;
  }

  async sendMedia(base64Data, mimetype, filename) {
    if (!this.isReady) {
      throw new Error('Client not ready');
    }

    const base64Body = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const media = new MessageMedia(mimetype, base64Body, filename);

    await this.client.sendMessage(this.config.targetContact, media, { sendSeen: false });

    const payload = {
      from: this.client.info?.wid?._serialized || 'me',
      to: this.config.targetContact,
      body: `[Media: ${filename}]`,
      timestamp: Math.floor(Date.now() / 1000),
      mediaUrl: null,
      mimetype,
    };

    if (this.messageCache.add(payload)) {
      this.broadcast('message', payload);
    }

    return payload;
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      log('error', 'Max reconnection attempts reached');
      this.broadcast('max_reconnect_reached', { message: 'Please restart the server' });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * this.reconnectAttempts;

    log('info', `Reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      if (!this.isInitializing && !this.isReady) {
        this.initialize();
      }
    }, delay);
  }

  async initialize() {
    if (this.isInitializing) {
      log('warn', 'Client already initializing');
      return;
    }

    this.isInitializing = true;
    log('info', 'Initializing WhatsApp client...');

    try {
      if (!this.client) {
        this.createClient();
      }
      await this.client.initialize();
      log('info', 'Client initialization started');
    } catch (err) {
      log('error', 'Failed to initialize client', { error: err.message });
      this.isInitializing = false;
      this.attemptReconnect();
    }
  }

  async destroy() {
    try {
      clearTimeout(this.loadingTimeout);
      clearTimeout(this.readyTimeout);
      if (this.client) {
        await this.client.destroy();
      }
    } catch (err) {
      log('warn', 'Error destroying client', { error: err.message });
    }
  }

  getStatus() {
    return {
      ready: this.isReady,
      initializing: this.isInitializing,
      hasQR: !!this.latestQR,
      info: this.client?.info || null,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// ============================================================================
// Express & Socket.IO Setup
// ============================================================================

// Initialize components
ensureDirectoryExists(CONFIG.mediaDir);
const deviceTokens = new DeviceTokenManager(CONFIG.tokensFile);
const messageCache = new MessageCache(CONFIG.maxCacheSize);

// Express app
const app = express();
const server = http.createServer(app);

// Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling'],
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(CONFIG.mediaDir));

// Connected clients tracking
const connectedClients = new Set();

// Broadcast function
function broadcast(event, data) {
  log('debug', `Broadcasting ${event} to ${connectedClients.size} clients`);
  io.emit(event, data);
}

// Initialize WhatsApp Manager
const whatsapp = new WhatsAppManager(CONFIG, messageCache, deviceTokens, broadcast);

// ============================================================================
// HTTP Routes
// ============================================================================

// Health check
app.get('/health', (req, res) => {
  const status = whatsapp.getStatus();
  let statusCode = 'disconnected';

  if (status.ready) {
    statusCode = 'connected';
  } else if (status.hasQR) {
    statusCode = 'qr_required';
  } else if (status.initializing) {
    statusCode = 'initializing';
  }

  res.json({
    status: statusCode,
    clients: connectedClients.size,
    cache: messageCache.size,
  });
});

// Sync messages
app.get('/sync-messages', (req, res) => {
  if (!whatsapp.isReady) {
    return res.status(503).json({ error: 'WhatsApp client not ready', success: false });
  }

  const messages = messageCache.getReversed();
  log('info', `Syncing ${messages.length} messages`);

  // Broadcast messages to all clients
  messages.forEach((msg) => broadcast('message', msg));

  res.json({
    message: 'Messages synced',
    count: messages.length,
    success: true,
  });
});

// Cache info
app.get('/cache-info', (req, res) => {
  res.json({
    ...messageCache.getInfo(),
    connectedClients: connectedClients.size,
  });
});

// Debug info
app.get('/debug-info', (req, res) => {
  res.json({
    ...whatsapp.getStatus(),
    cacheSize: messageCache.size,
    connectedClients: connectedClients.size,
    deviceTokens: deviceTokens.size,
  });
});

// Test send
app.post('/test-send', async (req, res) => {
  if (!whatsapp.isReady) {
    return res.status(503).json({ error: 'Client not ready' });
  }

  try {
    const result = await whatsapp.sendMessage('Test message from backend');
    res.json({ success: true, result });
  } catch (err) {
    log('error', 'Test send failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Register device for push notifications
app.post('/register-device', (req, res) => {
  const { token } = req.body;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Token required' });
  }

  deviceTokens.add(token);
  res.json({ success: true });
});

// ============================================================================
// Socket.IO Connection Handling
// ============================================================================

io.on('connection', (socket) => {
  connectedClients.add(socket.id);
  log('info', `Client connected [${socket.id}] - Total: ${connectedClients.size}`);

  // Send current state to new client
  if (whatsapp.isReady) {
    socket.emit('ready', { status: 'connected' });

    // Send cached messages
    const messages = messageCache.getReversed();
    if (messages.length > 0) {
      log('info', `Sending ${messages.length} cached messages to new client`);
      messages.forEach((msg) => socket.emit('message', msg));
    }
  } else if (whatsapp.latestQR) {
    socket.emit('qr', whatsapp.latestQR);
  } else {
    socket.emit('disconnected', { reason: 'not_ready' });
  }

  // Handle disconnect
  socket.on('disconnect', () => {
    connectedClients.delete(socket.id);
    log('info', `Client disconnected [${socket.id}] - Total: ${connectedClients.size}`);
  });

  // Handle status request
  socket.on('request_status', () => {
    if (whatsapp.isReady) {
      socket.emit('ready', { status: 'connected' });
    } else if (whatsapp.latestQR) {
      socket.emit('qr', whatsapp.latestQR);
    } else {
      socket.emit('disconnected', { reason: 'not_ready' });
    }
  });

  // Handle send message
  socket.on('send_message', async ({ message }) => {
    if (!whatsapp.isReady) {
      return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
    }

    try {
      log('info', `Sending message to ${CONFIG.targetContact}`);
      await whatsapp.sendMessage(message);
      socket.emit('send_result', { ok: true });
    } catch (err) {
      log('error', 'Send message failed', { error: err.message });
      socket.emit('send_result', { ok: false, error: err.message });
    }
  });

  // Handle send media
  socket.on('send_media', async ({ base64, mimetype, filename }) => {
    if (!whatsapp.isReady) {
      return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
    }

    try {
      log('info', `Sending media: ${filename}`);
      await whatsapp.sendMedia(base64, mimetype, filename);
      socket.emit('send_result', { ok: true });
    } catch (err) {
      log('error', 'Send media failed', { error: err.message });
      socket.emit('send_result', { ok: false, error: err.message });
    }
  });
});

// ============================================================================
// Media Cleanup
// ============================================================================

function cleanupOldMedia() {
  try {
    const files = fs.readdirSync(CONFIG.mediaDir);
    let deletedCount = 0;
    const now = Date.now();
    const maxAge = CONFIG.mediaRetentionDays * 24 * 60 * 60 * 1000;

    files.forEach((file) => {
      try {
        const filePath = path.join(CONFIG.mediaDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      } catch (err) {
        // Ignore individual file errors
      }
    });

    if (deletedCount > 0) {
      log('info', `Cleaned up ${deletedCount} old media files`);
    }
  } catch (err) {
    log('warn', 'Media cleanup failed', { error: err.message });
  }
}

// Run cleanup every 12 hours
setInterval(cleanupOldMedia, 12 * 60 * 60 * 1000);

// ============================================================================
// Startup & Shutdown
// ============================================================================

async function startup() {
  // Initialize push service
  pushService = await initializePushService();

  // Start HTTP server
  server.listen(CONFIG.port, () => {
    log('success', `🚀 Server running on port ${CONFIG.port}`);
    log('info', `Target contact: ${CONFIG.targetContact}`);
    log('info', `Media directory: ${CONFIG.mediaDir}`);
  });

  // Initialize WhatsApp client
  whatsapp.initialize();
}

async function shutdown(signal) {
  log('info', `Received ${signal}. Shutting down gracefully...`);

  // Notify clients
  broadcast('server_shutdown', { reason: signal });

  // Destroy WhatsApp client
  await whatsapp.destroy();

  // Close server
  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });

  // Force exit after 5 seconds
  setTimeout(() => {
    log('warn', 'Forced shutdown');
    process.exit(1);
  }, 5000);
}

// Handle shutdown signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  log('error', 'Uncaught exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled rejection', { reason: String(reason) });
});

// Start the application
startup();
