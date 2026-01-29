/**
 * Nexus Terminal Backend v2.1
 * WhatsApp Integration Server with Enhanced Reliability
 * - Message queue with retry logic
 * - Connection health monitoring
 * - Better error recovery
 * - Improved sync mechanism
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
  queueFile: path.join(__dirname, 'messageQueue.json'),
  maxCacheSize: 100,
  maxReconnectAttempts: 5,
  reconnectDelayMs: 3000,
  mediaRetentionDays: 15,
  clientStabilizationDelayMs: 5000,
  messageLoadDelayMs: 2000,
  // Message queue settings
  maxQueueSize: 50,
  maxRetries: 3,
  retryDelayMs: 2000,
  // Health monitoring
  healthCheckIntervalMs: 30000,
  connectionTimeoutMs: 60000,
};

// Stealth notification messages
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

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function generateMediaFilename(extension = 'bin') {
  return `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${extension}`;
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    log('info', `Created directory: ${dirPath}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
        return new Set(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
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
    if (!this.tokens.has(token)) {
      this.tokens.add(token);
      this.save();
      log('info', 'Device token registered');
      return true;
    }
    return false;
  }

  remove(token) {
    if (this.tokens.delete(token)) {
      this.save();
      return true;
    }
    return false;
  }

  getAll() { return [...this.tokens]; }
  get size() { return this.tokens.size; }
}

// ============================================================================
// Message Queue with Retry Logic
// ============================================================================

class MessageQueue {
  constructor(filePath, maxSize = 50) {
    this.filePath = filePath;
    this.maxSize = maxSize;
    this.queue = this.load();
    this.processing = false;
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch (err) {
      log('warn', 'Failed to load message queue', { error: err.message });
    }
    return [];
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.queue, null, 2));
    } catch (err) {
      log('error', 'Failed to save message queue', { error: err.message });
    }
  }

  add(message) {
    const queueItem = {
      id: generateId(),
      message,
      retries: 0,
      createdAt: Date.now(),
      status: 'pending',
    };

    this.queue.push(queueItem);
    if (this.queue.length > this.maxSize) {
      this.queue = this.queue.slice(-this.maxSize);
    }
    this.save();
    return queueItem.id;
  }

  getPending() {
    return this.queue.filter(item => item.status === 'pending');
  }

  updateStatus(id, status, error = null) {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.status = status;
      item.lastAttempt = Date.now();
      if (error) item.error = error;
      this.save();
    }
  }

  incrementRetry(id) {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.retries++;
      item.lastAttempt = Date.now();
      this.save();
      return item.retries;
    }
    return 0;
  }

  remove(id) {
    const idx = this.queue.findIndex(q => q.id === id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
      this.save();
      return true;
    }
    return false;
  }

  getById(id) {
    return this.queue.find(q => q.id === id);
  }

  clear() {
    this.queue = [];
    this.save();
  }

  get size() { return this.queue.length; }
  get pendingCount() { return this.getPending().length; }
}

// ============================================================================
// Message Cache Manager
// ============================================================================

class MessageCache {
  constructor(maxSize = 100) {
    this.messages = [];
    this.maxSize = maxSize;
    this.messageIds = new Set();
  }

  generateMessageId(msg) {
    return `${msg.from}-${msg.timestamp}-${msg.body?.slice(0, 20) || 'media'}`;
  }

  add(message) {
    const msgId = this.generateMessageId(message);
    if (this.messageIds.has(msgId)) return false;

    this.messageIds.add(msgId);
    this.messages.unshift(message);

    if (this.messages.length > this.maxSize) {
      const removed = this.messages.pop();
      this.messageIds.delete(this.generateMessageId(removed));
    }
    return true;
  }

  getAll() { return [...this.messages]; }
  getReversed() { return [...this.messages].reverse(); }

  getSince(timestamp) {
    return this.messages.filter(m => m.timestamp > timestamp);
  }

  clear() {
    this.messages = [];
    this.messageIds.clear();
  }

  get size() { return this.messages.length; }

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

    if (!process.env.FCM_PROJECT_ID || !process.env.FCM_CLIENT_EMAIL || !process.env.FCM_PRIVATE_KEY) {
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

    log('success', 'Firebase Admin initialized');
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
      android: { priority: 'high', notification: { sound: 'default', channelId: 'nexus_channel' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    });

    response.responses.forEach((res, idx) => {
      if (!res.success && (
        res.error?.code === 'messaging/registration-token-not-registered' ||
        res.error?.code === 'messaging/invalid-registration-token'
      )) {
        if (typeof onInvalidToken === 'function') onInvalidToken(tokens[idx]);
      }
    });
  } catch (err) {
    log('error', 'Push notification failed', { error: err.message });
  }
}

// ============================================================================
// WhatsApp Client Manager with Enhanced Reliability
// ============================================================================

class WhatsAppManager {
  constructor(config, messageCache, messageQueue, deviceTokens, broadcastFn) {
    this.config = config;
    this.messageCache = messageCache;
    this.messageQueue = messageQueue;
    this.deviceTokens = deviceTokens;
    this.broadcast = broadcastFn;

    this.client = null;
    this.isReady = false;
    this.isInitializing = false;
    this.isDestroying = false;
    this.latestQR = null;
    this.reconnectAttempts = 0;
    this.loadingTimeout = null;
    this.readyTimeout = null;
    this.healthCheckInterval = null;
    this.lastActivity = Date.now();
    this.queueProcessor = null;
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

    if (process.env.LOW_MEMORY === 'true') {
      args.push('--single-process');
    }

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

    if (executablePath) config.executablePath = executablePath;
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
    this.client.on('qr', (qr) => {
      this.latestQR = qr;
      this.isReady = false;
      log('info', 'QR Code received');
      qrcode.generate(qr, { small: true });
      this.broadcast('qr', qr);
    });

    this.client.on('authenticated', () => {
      log('success', 'Authentication successful');
      this.latestQR = null;
      this.broadcast('authenticated', { status: 'authenticated' });

      this.readyTimeout = setTimeout(() => {
        if (!this.isReady && this.client?.info) {
          log('warn', 'Forcing ready event after authentication timeout');
          this.handleReady();
        }
      }, 20000);
    });

    this.client.on('auth_failure', (msg) => {
      log('error', 'Authentication failed', { message: msg });
      this.isInitializing = false;
      this.broadcast('auth_failure', { error: msg });
    });

    this.client.on('loading_screen', (percent, message) => {
      log('debug', `Loading: ${percent}% - ${message}`);
      this.broadcast('loading', { percent, message });

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

    this.client.on('ready', () => {
      clearTimeout(this.readyTimeout);
      clearTimeout(this.loadingTimeout);
      this.handleReady();
    });

    this.client.on('message', async (msg) => {
      this.lastActivity = Date.now();
      await this.handleIncomingMessage(msg);
    });

    this.client.on('message_create', async (msg) => {
      this.lastActivity = Date.now();
      await this.handleSentMessage(msg);
    });

    this.client.on('message_ack', (msg, ack) => {
      // Acknowledge levels: -1 = error, 0 = pending, 1 = sent, 2 = delivered, 3 = read
      this.broadcast('message_ack', {
        messageId: msg.id._serialized,
        ack,
        timestamp: Date.now()
      });
    });

    this.client.on('disconnected', (reason) => {
      log('error', 'WhatsApp disconnected', { reason });
      this.handleDisconnection(reason);
    });

    this.client.on('change_state', (state) => {
      log('debug', 'State changed', { state });
      this.broadcast('state_change', { state });

      if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
        this.handleDisconnection(state);
      }
    });

    this.client.on('error', (err) => {
      log('error', 'Client error', { error: err.message });
    });
  }

  handleDisconnection(reason) {
    this.isReady = false;
    this.isInitializing = false;
    this.latestQR = null;
    this.stopHealthCheck();
    this.stopQueueProcessor();
    this.broadcast('disconnected', { reason });

    if (!this.isDestroying) {
      this.attemptReconnect();
    }
  }

  async handleReady() {
    if (this.isReady) return;

    log('success', '🎉 WhatsApp Client Ready!');
    this.isReady = true;
    this.isInitializing = false;
    this.reconnectAttempts = 0;
    this.latestQR = null;
    this.lastActivity = Date.now();

    const clientInfo = {
      pushname: this.client.info?.pushname || 'User',
      phone: this.client.info?.wid?._serialized || 'Unknown',
    };

    log('info', 'Connected as', clientInfo);
    this.broadcast('ready', { status: 'connected', info: clientInfo });

    // Start health monitoring
    this.startHealthCheck();

    // Start queue processor
    this.startQueueProcessor();

    // Load message history
    setTimeout(() => this.loadMessageHistory(), this.config.clientStabilizationDelayMs);
  }

  startHealthCheck() {
    this.stopHealthCheck();

    this.healthCheckInterval = setInterval(async () => {
      if (!this.isReady || this.isDestroying) return;

      try {
        // Check if client is still responsive
        const state = await this.client.getState();

        if (state !== 'CONNECTED') {
          log('warn', 'Health check: Client not connected', { state });
          this.handleDisconnection(`health_check_failed: ${state}`);
          return;
        }

        // Check for connection timeout
        const timeSinceActivity = Date.now() - this.lastActivity;
        if (timeSinceActivity > this.config.connectionTimeoutMs) {
          log('warn', 'Health check: Connection timeout', { timeSinceActivity });
          // Try to refresh connection
          await this.refreshConnection();
        }

        this.broadcast('health_check', {
          status: 'ok',
          state,
          lastActivity: this.lastActivity,
          queueSize: this.messageQueue.pendingCount
        });
      } catch (err) {
        log('error', 'Health check failed', { error: err.message });
        this.handleDisconnection('health_check_error');
      }
    }, this.config.healthCheckIntervalMs);
  }

  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  async refreshConnection() {
    try {
      log('info', 'Refreshing connection...');
      // Try to get state to verify connection is alive
      const state = await this.client.getState();
      if (state === 'CONNECTED') {
        this.lastActivity = Date.now();
        log('success', 'Connection refreshed', { state });
      } else {
        throw new Error(`Unexpected state: ${state}`);
      }
    } catch (err) {
      log('error', 'Failed to refresh connection', { error: err.message });
      throw err;
    }
  }

  startQueueProcessor() {
    this.stopQueueProcessor();

    this.queueProcessor = setInterval(async () => {
      if (!this.isReady || this.messageQueue.processing) return;

      const pending = this.messageQueue.getPending();
      if (pending.length === 0) return;

      this.messageQueue.processing = true;

      for (const item of pending) {
        if (!this.isReady) break;

        try {
          log('info', `Processing queued message: ${item.id}`);

          if (item.message.type === 'text') {
            await this.sendMessageDirect(item.message.content);
          } else if (item.message.type === 'media') {
            await this.sendMediaDirect(item.message.base64, item.message.mimetype, item.message.filename);
          }

          this.messageQueue.updateStatus(item.id, 'sent');
          this.broadcast('queue_item_sent', { id: item.id });

          await sleep(500); // Rate limiting
        } catch (err) {
          log('error', `Failed to send queued message: ${item.id}`, { error: err.message });

          const retries = this.messageQueue.incrementRetry(item.id);
          if (retries >= this.config.maxRetries) {
            this.messageQueue.updateStatus(item.id, 'failed', err.message);
            this.broadcast('queue_item_failed', { id: item.id, error: err.message });
          } else {
            await sleep(this.config.retryDelayMs * retries);
          }
        }
      }

      this.messageQueue.processing = false;
    }, 5000);
  }

  stopQueueProcessor() {
    if (this.queueProcessor) {
      clearInterval(this.queueProcessor);
      this.queueProcessor = null;
    }
  }

  async loadMessageHistory() {
    try {
      log('info', 'Loading message history...');
      await sleep(this.config.messageLoadDelayMs);

      if (!this.isReady) {
        log('warn', 'Client not ready, skipping message history load');
        return;
      }

      let targetChat = null;

      // Try getChatById first (more reliable in newer versions)
      try {
        targetChat = await this.client.getChatById(this.config.targetContact);
        log('info', 'Target chat found via getChatById');
      } catch (chatErr) {
        log('warn', 'getChatById failed, trying getChats fallback', { error: chatErr.message });

        // Fallback to getChats
        try {
          const chats = await this.client.getChats();
          log('info', `Found ${chats.length} chats`);
          targetChat = chats.find(chat => chat.id._serialized === this.config.targetContact);
        } catch (chatsErr) {
          log('error', 'getChats also failed', { error: chatsErr.message });
        }
      }

      if (!targetChat) {
        log('info', 'Target chat not found - will populate as messages arrive');
        this.broadcast('history_loaded', { count: 0 });
        return;
      }

      log('info', 'Loading messages from target chat...');
      const messages = await targetChat.fetchMessages({ limit: 50 });
      log('info', `Loaded ${messages.length} messages from history`);

      let loadedCount = 0;
      for (const msg of messages.reverse()) {
        try {
          const payload = await this.createMessagePayload(msg);
          if (payload && this.messageCache.add(payload)) {
            this.broadcast('message', payload);
            loadedCount++;
          }
        } catch (err) {
          log('warn', 'Failed to process historical message', { error: err.message });
        }
      }

      log('success', `Message cache populated with ${loadedCount} messages`);
      this.broadcast('history_loaded', { count: loadedCount });
    } catch (err) {
      log('error', 'Failed to load message history', { error: err.message });
      this.broadcast('history_loaded', { count: 0, error: err.message });
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
      id: msg.id?._serialized || generateId(),
      from: msg.from,
      to: msg.to,
      body: msg.body || '',
      timestamp: msg.timestamp || Math.floor(Date.now() / 1000),
      mediaUrl,
      mimetype,
      fromMe: msg.fromMe || false,
    };
  }

  async handleIncomingMessage(msg) {
    try {
      const isTargetConversation = msg.from === this.config.targetContact || msg.to === this.config.targetContact;
      if (!isTargetConversation) return;

      log('info', 'Incoming message', { from: msg.from });

      const payload = await this.createMessagePayload(msg);
      if (!payload) return;

      const isNew = this.messageCache.add(payload);

      if (isNew) {
        this.broadcast('message', payload);

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

      const payload = await this.createMessagePayload(msg);
      if (this.messageCache.add(payload)) {
        log('info', 'Sent message captured');
        this.broadcast('message', payload);
      }
    } catch (err) {
      log('error', 'Error handling sent message', { error: err.message });
    }
  }

  async sendMessageDirect(text) {
    await this.client.sendMessage(this.config.targetContact, text, { sendSeen: false });
    this.lastActivity = Date.now();
  }

  async sendMediaDirect(base64Data, mimetype, filename) {
    const base64Body = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const media = new MessageMedia(mimetype, base64Body, filename);
    await this.client.sendMessage(this.config.targetContact, media, { sendSeen: false });
    this.lastActivity = Date.now();
  }

  // Queue-based message sending with delivery confirmation
  async sendMessage(text) {
    if (!this.isReady) {
      // Queue the message for later
      const queueId = this.messageQueue.add({ type: 'text', content: text });
      return { queued: true, queueId };
    }

    try {
      await this.sendMessageDirect(text);

      const payload = {
        id: generateId(),
        from: this.client.info?.wid?._serialized || 'me',
        to: this.config.targetContact,
        body: text,
        timestamp: Math.floor(Date.now() / 1000),
        mediaUrl: null,
        mimetype: null,
        fromMe: true,
        status: 'sent',
      };

      this.messageCache.add(payload);
      this.broadcast('message', payload);
      return { success: true, message: payload };
    } catch (err) {
      // Queue on failure
      const queueId = this.messageQueue.add({ type: 'text', content: text });
      log('error', 'Send failed, queued', { error: err.message, queueId });
      return { queued: true, queueId, error: err.message };
    }
  }

  async sendMedia(base64Data, mimetype, filename) {
    if (!this.isReady) {
      const queueId = this.messageQueue.add({ type: 'media', base64: base64Data, mimetype, filename });
      return { queued: true, queueId };
    }

    try {
      await this.sendMediaDirect(base64Data, mimetype, filename);

      const payload = {
        id: generateId(),
        from: this.client.info?.wid?._serialized || 'me',
        to: this.config.targetContact,
        body: `[Media: ${filename}]`,
        timestamp: Math.floor(Date.now() / 1000),
        mediaUrl: null,
        mimetype,
        fromMe: true,
        status: 'sent',
      };

      this.messageCache.add(payload);
      this.broadcast('message', payload);
      return { success: true, message: payload };
    } catch (err) {
      const queueId = this.messageQueue.add({ type: 'media', base64: base64Data, mimetype, filename });
      return { queued: true, queueId, error: err.message };
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      log('error', 'Max reconnection attempts reached');
      this.broadcast('max_reconnect_reached', { message: 'Please restart the server' });
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * Math.min(this.reconnectAttempts, 5);

    log('info', `Reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${delay}ms`);
    this.broadcast('reconnecting', { attempt: this.reconnectAttempts, maxAttempts: this.config.maxReconnectAttempts });

    setTimeout(async () => {
      if (!this.isInitializing && !this.isReady && !this.isDestroying) {
        try {
          // Destroy and recreate client
          if (this.client) {
            try { await this.client.destroy(); } catch (e) {}
            this.client = null;
          }
          await this.initialize();
        } catch (err) {
          log('error', 'Reconnect failed', { error: err.message });
          this.attemptReconnect();
        }
      }
    }, delay);
  }

  async initialize() {
    if (this.isInitializing || this.isDestroying) {
      log('warn', 'Client already initializing or destroying');
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
    this.isDestroying = true;
    this.stopHealthCheck();
    this.stopQueueProcessor();
    clearTimeout(this.loadingTimeout);
    clearTimeout(this.readyTimeout);

    try {
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
      lastActivity: this.lastActivity,
      queueSize: this.messageQueue.pendingCount,
    };
  }
}

// ============================================================================
// Express & Socket.IO Setup
// ============================================================================

ensureDirectoryExists(CONFIG.mediaDir);
const deviceTokens = new DeviceTokenManager(CONFIG.tokensFile);
const messageCache = new MessageCache(CONFIG.maxCacheSize);
const messageQueue = new MessageQueue(CONFIG.queueFile, CONFIG.maxQueueSize);

const app = express();
const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 5000,
  transports: ['websocket', 'polling'],
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(CONFIG.mediaDir));

const connectedClients = new Map(); // Track client info

function broadcast(event, data) {
  io.emit(event, data);
}

const whatsapp = new WhatsAppManager(CONFIG, messageCache, messageQueue, deviceTokens, broadcast);

// ============================================================================
// HTTP Routes
// ============================================================================

app.get('/health', (req, res) => {
  const status = whatsapp.getStatus();
  res.json({
    status: status.ready ? 'connected' : (status.hasQR ? 'qr_required' : (status.initializing ? 'initializing' : 'disconnected')),
    clients: connectedClients.size,
    cache: messageCache.size,
    queue: messageQueue.pendingCount,
    lastActivity: status.lastActivity,
  });
});

app.get('/sync-messages', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const messages = since ? messageCache.getSince(since) : messageCache.getReversed();

  log('info', `Syncing ${messages.length} messages (since: ${since})`);
  messages.forEach((msg) => broadcast('message', msg));

  res.json({ message: 'Messages synced', count: messages.length, success: true });
});

app.get('/cache-info', (req, res) => {
  res.json({ ...messageCache.getInfo(), connectedClients: connectedClients.size });
});

app.get('/debug-info', (req, res) => {
  res.json({
    ...whatsapp.getStatus(),
    cacheSize: messageCache.size,
    connectedClients: connectedClients.size,
    deviceTokens: deviceTokens.size,
    queueInfo: {
      size: messageQueue.size,
      pending: messageQueue.pendingCount,
    },
  });
});

app.get('/queue-status', (req, res) => {
  res.json({
    size: messageQueue.size,
    pending: messageQueue.pendingCount,
    items: messageQueue.queue.map(q => ({
      id: q.id,
      status: q.status,
      retries: q.retries,
      createdAt: q.createdAt,
    })),
  });
});

app.post('/test-send', async (req, res) => {
  const result = await whatsapp.sendMessage('Test message from backend');
  res.json(result);
});

app.post('/register-device', (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token required' });
  deviceTokens.add(token);
  res.json({ success: true });
});

// ============================================================================
// Socket.IO Connection Handling
// ============================================================================

io.on('connection', (socket) => {
  connectedClients.set(socket.id, { connectedAt: Date.now(), lastSync: 0 });
  log('info', `Client connected [${socket.id}] - Total: ${connectedClients.size}`);

  // Send current state
  if (whatsapp.isReady) {
    socket.emit('ready', { status: 'connected' });
    const messages = messageCache.getReversed();
    if (messages.length > 0) {
      socket.emit('sync_messages', messages);
    }
  } else if (whatsapp.latestQR) {
    socket.emit('qr', whatsapp.latestQR);
  } else {
    socket.emit('disconnected', { reason: 'not_ready' });
  }

  socket.on('disconnect', () => {
    connectedClients.delete(socket.id);
    log('info', `Client disconnected [${socket.id}] - Total: ${connectedClients.size}`);
  });

  socket.on('request_status', () => {
    const status = whatsapp.getStatus();
    if (status.ready) {
      socket.emit('ready', { status: 'connected' });
    } else if (status.hasQR) {
      socket.emit('qr', whatsapp.latestQR);
    } else {
      socket.emit('disconnected', { reason: 'not_ready', status });
    }
  });

  socket.on('sync_request', async (data) => {
    const since = data?.since || 0;
    const forceReload = data?.forceReload || false;

    // If force reload requested and WhatsApp is ready, reload messages first
    if (forceReload && whatsapp.isReady) {
      log('info', 'Sync with force reload requested');
      await whatsapp.loadMessageHistory();
    }

    const messages = since ? messageCache.getSince(since) : messageCache.getReversed();
    socket.emit('sync_messages', messages);

    const clientInfo = connectedClients.get(socket.id);
    if (clientInfo) clientInfo.lastSync = Date.now();
  });

  socket.on('send_message', async ({ message, tempId }) => {
    const result = await whatsapp.sendMessage(message);

    if (result.success) {
      socket.emit('send_result', { ok: true, tempId, message: result.message });
    } else if (result.queued) {
      socket.emit('send_result', { ok: true, queued: true, tempId, queueId: result.queueId });
    } else {
      socket.emit('send_result', { ok: false, tempId, error: result.error });
    }
  });

  socket.on('send_media', async ({ base64, mimetype, filename, tempId }) => {
    const result = await whatsapp.sendMedia(base64, mimetype, filename);

    if (result.success) {
      socket.emit('send_result', { ok: true, tempId, message: result.message });
    } else if (result.queued) {
      socket.emit('send_result', { ok: true, queued: true, tempId, queueId: result.queueId });
    } else {
      socket.emit('send_result', { ok: false, tempId, error: result.error });
    }
  });

  socket.on('get_queue_status', () => {
    socket.emit('queue_status', {
      pending: messageQueue.pendingCount,
      processing: messageQueue.processing,
    });
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
      } catch (err) {}
    });

    if (deletedCount > 0) log('info', `Cleaned up ${deletedCount} old media files`);
  } catch (err) {
    log('warn', 'Media cleanup failed', { error: err.message });
  }
}

setInterval(cleanupOldMedia, 12 * 60 * 60 * 1000);

// ============================================================================
// Startup & Shutdown
// ============================================================================

async function startup() {
  pushService = await initializePushService();

  server.listen(CONFIG.port, () => {
    log('success', `🚀 Server running on port ${CONFIG.port}`);
    log('info', `Target contact: ${CONFIG.targetContact}`);
    log('info', `Pending queue items: ${messageQueue.pendingCount}`);
  });

  whatsapp.initialize();
}

async function shutdown(signal) {
  log('info', `Received ${signal}. Shutting down gracefully...`);
  broadcast('server_shutdown', { reason: signal });
  await whatsapp.destroy();

  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    log('warn', 'Forced shutdown');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  log('error', 'Uncaught exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled rejection', { reason: String(reason) });
});

startup();
