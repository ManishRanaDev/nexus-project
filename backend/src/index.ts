import express from 'express';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import cors from 'cors';
import { config } from './config.js';
import { router } from './routes.js';
import { setupSocketHandlers, getConnectedClientCount } from './socketHandler.js';
import { connectWhatsApp, setBroadcast, destroyClient } from './whatsapp.js';
import { cleanupOldMedia } from './media.js';
import { getCache } from './messageCache.js';

const app = express();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/media', express.static(config.mediaDir));

// Routes
app.use(router);

// Wire broadcast function from WhatsApp module to Socket.IO
setBroadcast((event: string, data: unknown) => {
  console.log(`Broadcasting ${event} to ${getConnectedClientCount()} clients`);
  io.emit(event, data);
});

// Socket.IO handlers
setupSocketHandlers(io);

// Sync-messages also broadcasts via socket
app.get('/sync-messages-broadcast', (_req, res) => {
  const cache = getCache();
  cache.slice().reverse().forEach((msg) => {
    io.emit('message', msg);
  });
  res.json({ broadcasted: cache.length });
});

// Start server
server.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
  console.log(`Target contact: ${config.targetContact}`);
});

// Initialize WhatsApp
console.log('Initializing WhatsApp client (Baileys)...');
connectWhatsApp().catch((err) => {
  console.error('Failed to initialize WhatsApp:', (err as Error).message);
});

// Media cleanup every 12 hours
setInterval(() => {
  const deleted = cleanupOldMedia();
  if (deleted > 0) console.log(`Deleted ${deleted} old media files`);
}, config.mediaCleanupIntervalMs);

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`Received ${signal}. Shutting down...`);
  io.emit('server_shutdown', { reason: signal });

  try {
    await destroyClient();
  } catch {
    // ignore
  }

  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
