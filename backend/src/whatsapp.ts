import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WASocket,
  proto,
  downloadMediaMessage,
  getContentType,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcodeTerminal from 'qrcode-terminal';
import { config, getStealthNotification } from './config.js';
import { addToCache, getCache } from './messageCache.js';
import { saveMedia } from './media.js';
import { sendPush } from './pushService.js';
import { getDeviceTokens, removeDeviceToken } from './deviceTokens.js';
import type { MessagePayload, ServerState } from './types.js';

const logger = pino({ level: 'silent' });

let sock: WASocket | null = null;
let broadcastFn: ((event: string, data: unknown) => void) | null = null;

export const state: ServerState = {
  isReady: false,
  isInitializing: false,
  reconnectAttempts: 0,
  latestQR: null,
};

export function setSock(s: WASocket | null) {
  sock = s;
}

export function getSock(): WASocket | null {
  return sock;
}

export function isClientReady(): boolean {
  return state.isReady && sock !== null;
}

export function setBroadcast(fn: (event: string, data: unknown) => void) {
  broadcastFn = fn;
}

function broadcast(event: string, data: unknown) {
  if (broadcastFn) broadcastFn(event, data);
}

function extractMessageText(msg: proto.IWebMessageInfo): string {
  const m = msg.message;
  if (!m) return '';
  const type = getContentType(m);
  if (!type) return '';

  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;

  const content = (m as Record<string, any>)[type];
  if (content?.caption) return content.caption;
  if (content?.text) return content.text;

  return '';
}

function hasMedia(msg: proto.IWebMessageInfo): boolean {
  const m = msg.message;
  if (!m) return false;
  const type = getContentType(m);
  if (!type) return false;
  return ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(type);
}

function getMimetype(msg: proto.IWebMessageInfo): string | null {
  const m = msg.message;
  if (!m) return null;
  const type = getContentType(m);
  if (!type) return null;
  const content = (m as Record<string, any>)[type];
  return content?.mimetype || null;
}

async function downloadAndSaveMedia(msg: proto.IWebMessageInfo): Promise<string | null> {
  try {
    const buffer = await downloadMediaMessage(
      msg,
      'buffer',
      {},
      {
        logger,
        reuploadRequest: sock!.updateMediaMessage,
      }
    );
    const mimetype = getMimetype(msg) || 'application/octet-stream';
    return saveMedia(buffer as Buffer, mimetype);
  } catch (err) {
    console.warn('Media download failed:', (err as Error).message);
    return null;
  }
}

function messageToPayload(
  msg: proto.IWebMessageInfo,
  mediaUrl: string | null
): MessagePayload {
  const fromMe = msg.key.fromMe ?? false;
  const remoteJid = msg.key.remoteJid || '';
  return {
    from: fromMe ? 'me' : remoteJid,
    to: fromMe ? remoteJid : 'me',
    body: extractMessageText(msg),
    timestamp: Number(msg.messageTimestamp) || Date.now(),
    mediaUrl,
    mimetype: getMimetype(msg),
    fromMe,
  };
}

export async function connectWhatsApp(): Promise<void> {
  if (state.isInitializing) {
    console.log('Already initializing, skipping...');
    return;
  }

  state.isInitializing = true;

  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(config.authDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`Using Baileys v${version.join('.')}`);

    sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        state.latestQR = qr;
        state.isReady = false;
        console.log('QR code received');
        qrcodeTerminal.generate(qr, { small: true });
        broadcast('qr', qr);
      }

      if (connection === 'close') {
        state.isReady = false;
        state.isInitializing = false;

        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const reason = Object.entries(DisconnectReason).find(([, v]) => v === statusCode)?.[0] || 'unknown';

        console.log(`Connection closed: ${reason} (${statusCode})`);
        broadcast('disconnected', { reason });

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect && state.reconnectAttempts < config.maxReconnectAttempts) {
          state.reconnectAttempts++;
          const delay = config.reconnectDelayMs * state.reconnectAttempts;
          console.log(`Reconnecting in ${delay}ms (attempt ${state.reconnectAttempts}/${config.maxReconnectAttempts})...`);

          setTimeout(() => {
            if (!state.isInitializing && !state.isReady) {
              connectWhatsApp().catch((err) =>
                console.error('Reconnect failed:', (err as Error).message)
              );
            }
          }, delay);
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log('Logged out — clear auth and scan QR again');
          broadcast('auth_failure', { error: 'logged_out' });
        } else {
          console.error('Max reconnection attempts reached');
          broadcast('max_reconnect_reached', { message: 'Please restart the server' });
        }
      }

      if (connection === 'open') {
        console.log('WhatsApp connection open');
        state.isReady = true;
        state.isInitializing = false;
        state.reconnectAttempts = 0;
        state.latestQR = null;

        const user = sock?.user;
        broadcast('ready', {
          status: 'connected',
          info: {
            pushname: user?.name || 'User',
            phone: user?.id || 'Unknown',
          },
        });

        // Load recent messages after short stabilization delay
        setTimeout(() => loadRecentMessages(), 3000);
      }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
      for (const msg of msgs) {
        try {
          const remoteJid = msg.key.remoteJid || '';
          const isTargetChat =
            remoteJid === config.targetContact ||
            remoteJid.includes(config.targetContact.split('@')[0]);

          if (!isTargetChat) continue;

          // Skip status broadcasts
          if (remoteJid === 'status@broadcast') continue;

          let mediaUrl: string | null = null;
          if (hasMedia(msg)) {
            mediaUrl = await downloadAndSaveMedia(msg);
          }

          const payload = messageToPayload(msg, mediaUrl);
          if (!payload.body && !payload.mediaUrl) continue;

          const isNew = addToCache(payload);
          if (isNew) {
            console.log(`Message ${type === 'notify' ? '(new)' : '(history)'}: ${payload.body?.slice(0, 50) || '[media]'}`);
            broadcast('message', payload);

            // Send push for incoming messages from others
            if (type === 'notify' && !msg.key.fromMe) {
              const tokens = getDeviceTokens();
              if (tokens.length > 0) {
                sendPush(
                  tokens,
                  {
                    title: 'Nexus Terminal',
                    body: getStealthNotification(),
                    data: {
                      type: 'incoming_signal',
                      ts: String(payload.timestamp),
                    },
                  },
                  (deadToken) => removeDeviceToken(deadToken)
                ).catch((err) => console.error('Push failed:', (err as Error).message));
              }
            }
          }
        } catch (err) {
          console.warn('Error processing message:', (err as Error).message);
        }
      }
    });
  } catch (err) {
    console.error('WhatsApp connection error:', (err as Error).message);
    state.isInitializing = false;
    throw err;
  }
}

async function loadRecentMessages(): Promise<void> {
  if (!sock || !state.isReady) return;

  try {
    console.log('Loading recent messages...');

    // Use Baileys message store or request history
    // Baileys syncs messages via messages.upsert with type 'append' on connection
    // We give it time to sync, then broadcast whatever we have cached
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const cached = getCache();
    console.log(`Broadcasting ${cached.length} cached messages`);
    cached.slice().reverse().forEach((msg) => {
      broadcast('message', msg);
    });
  } catch (err) {
    console.error('Error loading messages:', (err as Error).message);
  }
}

export async function sendTextMessage(text: string): Promise<MessagePayload> {
  if (!sock || !state.isReady) throw new Error('Client not ready');

  const sent = await sock.sendMessage(config.targetContact, { text });
  const payload: MessagePayload = {
    from: 'me',
    to: config.targetContact,
    body: text,
    timestamp: Date.now(),
    mediaUrl: null,
    mimetype: null,
    fromMe: true,
  };

  addToCache(payload);
  broadcast('message', payload);
  return payload;
}

export async function sendMediaMessage(
  base64: string,
  mimetype: string,
  filename: string
): Promise<MessagePayload> {
  if (!sock || !state.isReady) throw new Error('Client not ready');

  const raw = base64.includes(',') ? base64.split(',')[1] : base64;
  const buffer = Buffer.from(raw, 'base64');

  let msgContent: Parameters<WASocket['sendMessage']>[1];

  if (mimetype.startsWith('image/')) {
    msgContent = { image: buffer, caption: filename };
  } else if (mimetype.startsWith('audio/')) {
    msgContent = { audio: buffer, mimetype };
  } else if (mimetype.startsWith('video/')) {
    msgContent = { video: buffer, caption: filename };
  } else {
    msgContent = { document: buffer, mimetype, fileName: filename };
  }

  await sock.sendMessage(config.targetContact, msgContent);

  const mediaUrl = saveMedia(buffer, mimetype);
  const payload: MessagePayload = {
    from: 'me',
    to: config.targetContact,
    body: `[Media: ${filename}]`,
    timestamp: Date.now(),
    mediaUrl,
    mimetype,
    fromMe: true,
  };

  addToCache(payload);
  broadcast('message', payload);
  return payload;
}

export async function destroyClient(): Promise<void> {
  if (sock) {
    try {
      await sock.logout();
    } catch {
      // ignore logout errors during shutdown
    }
    sock.end(undefined);
    sock = null;
  }
  state.isReady = false;
}
