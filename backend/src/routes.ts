import { Router } from 'express';
import { config } from './config.js';
import { isClientReady, state, sendTextMessage } from './whatsapp.js';
import { getCache, getCacheInfo } from './messageCache.js';
import { addDeviceToken } from './deviceTokens.js';
import { getConnectedClientCount } from './socketHandler.js';

export const router = Router();

router.get('/health', (_req, res) => {
  const clients = getConnectedClientCount();
  if (isClientReady()) {
    res.json({ status: 'connected', clients });
  } else if (state.latestQR) {
    res.json({ status: 'qr_required', clients });
  } else {
    res.json({ status: 'disconnected', clients });
  }
});

router.get('/sync-messages', (_req, res) => {
  if (!isClientReady()) {
    res.status(503).json({ error: 'WhatsApp client not ready' });
    return;
  }

  try {
    const cache = getCache();
    res.json({
      message: 'Messages synced from cache',
      count: cache.length,
      success: true,
    });

    // Broadcasting handled via socket — import io would create circular dep,
    // so caller should broadcast after this route responds
  } catch (err) {
    res.status(500).json({
      error: 'Sync failed',
      detail: (err as Error).message,
      success: false,
    });
  }
});

router.get('/cache-info', (_req, res) => {
  const info = getCacheInfo();
  res.json({
    ...info,
    connectedClients: getConnectedClientCount(),
  });
});

router.get('/debug-info', (_req, res) => {
  res.json({
    ready: isClientReady(),
    latestQR: !!state.latestQR,
    cacheSize: getCache().length,
    connectedClients: getConnectedClientCount(),
    reconnectAttempts: state.reconnectAttempts,
    isInitializing: state.isInitializing,
  });
});

router.post('/test-send', async (_req, res) => {
  if (!isClientReady()) {
    res.status(503).json({ error: 'Client not ready' });
    return;
  }

  try {
    await sendTextMessage('Test message from backend');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/register-device', (req, res) => {
  const { token } = req.body;
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: 'token_required' });
    return;
  }

  const isNew = addDeviceToken(token);
  if (isNew) {
    console.log('Device token stored:', token.slice(0, 12) + '...');
  }

  res.json({ success: true });
});
