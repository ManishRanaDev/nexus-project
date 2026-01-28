import type { Server, Socket } from 'socket.io';
import { state, isClientReady, sendTextMessage, sendMediaMessage } from './whatsapp.js';
import { getCache } from './messageCache.js';

const connectedClients = new Set<string>();

export function getConnectedClientCount(): number {
  return connectedClients.size;
}

function sendCurrentState(socket: Socket) {
  if (isClientReady()) {
    socket.emit('ready', { status: 'connected' });
    const cached = getCache();
    if (cached.length > 0) {
      console.log(`Sending ${cached.length} cached messages to client ${socket.id}`);
      cached.slice().reverse().forEach((msg) => {
        socket.emit('message', msg);
      });
    }
  } else if (state.latestQR) {
    socket.emit('qr', state.latestQR);
  } else {
    socket.emit('disconnected', { reason: 'not_ready' });
  }
}

export function setupSocketHandlers(io: Server): void {
  io.on('connection', (socket) => {
    connectedClients.add(socket.id);
    console.log(`Client connected [${socket.id}] — Total: ${connectedClients.size}`);

    sendCurrentState(socket);

    socket.on('disconnect', () => {
      connectedClients.delete(socket.id);
      console.log(`Client disconnected [${socket.id}] — Total: ${connectedClients.size}`);
    });

    socket.on('request_status', () => {
      sendCurrentState(socket);
    });

    socket.on('send_message', async ({ message }: { message: string }) => {
      if (!isClientReady()) {
        return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
      }

      try {
        await sendTextMessage(message);
        socket.emit('send_result', { ok: true });
      } catch (err) {
        console.error('Send failed:', (err as Error).message);
        socket.emit('send_result', { ok: false, error: (err as Error).message });
      }
    });

    socket.on(
      'send_media',
      async ({
        base64,
        mimetype,
        filename,
      }: {
        base64: string;
        mimetype: string;
        filename: string;
      }) => {
        if (!isClientReady()) {
          return socket.emit('send_result', { ok: false, error: 'client_not_ready' });
        }

        try {
          await sendMediaMessage(base64, mimetype, filename);
          socket.emit('send_result', { ok: true });
        } catch (err) {
          console.error('Send media failed:', (err as Error).message);
          socket.emit('send_result', { ok: false, error: (err as Error).message });
        }
      }
    );
  });
}
