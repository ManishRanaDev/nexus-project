import admin from 'firebase-admin';
import { config } from './config.js';
import type { PushPayload } from './types.js';

let initialized = false;

function ensureInit() {
  if (initialized) return;
  if (!config.fcm.projectId || !config.fcm.clientEmail || !config.fcm.privateKey) {
    console.warn('Firebase credentials not configured — push notifications disabled');
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.fcm.projectId,
        clientEmail: config.fcm.clientEmail,
        privateKey: config.fcm.privateKey,
      }),
    });
    initialized = true;
  } catch (err) {
    console.error('Firebase init failed:', (err as Error).message);
  }
}

export async function sendPush(
  tokens: string[],
  payload: PushPayload,
  onInvalidToken?: (token: string) => void
): Promise<void> {
  if (!tokens.length) return;

  ensureInit();
  if (!initialized) return;

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    });

    response.responses.forEach((res, idx) => {
      if (
        !res.success &&
        res.error?.code === 'messaging/registration-token-not-registered'
      ) {
        onInvalidToken?.(tokens[idx]);
      }
    });
  } catch (err) {
    console.error('Push send failed:', (err as Error).message);
  }
}
