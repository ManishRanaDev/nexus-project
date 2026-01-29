/**
 * Push Notification Service
 * Firebase Cloud Messaging integration for Nexus Terminal
 */

'use strict';

const admin = require('firebase-admin');

let isInitialized = false;

/**
 * Initialize Firebase Admin SDK
 * @returns {boolean} Whether initialization was successful
 */
function initializeFirebase() {
  if (isInitialized) return true;

  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[PushService] Firebase credentials not configured - push notifications disabled');
    return false;
  }

  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    }
    isInitialized = true;
    console.log('[PushService] Firebase Admin initialized successfully');
    return true;
  } catch (err) {
    console.error('[PushService] Failed to initialize Firebase:', err.message);
    return false;
  }
}

/**
 * Send push notification to multiple device tokens
 * @param {string[]} tokens - Array of FCM device tokens
 * @param {Object} payload - Notification payload
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {Object} [payload.data] - Additional data payload
 * @param {Function} [onInvalidToken] - Callback for invalid tokens
 * @returns {Promise<Object>} Result summary
 */
async function sendPush(tokens, payload, onInvalidToken) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return { success: 0, failure: 0, total: 0 };
  }

  if (!isInitialized && !initializeFirebase()) {
    console.warn('[PushService] Firebase not initialized, skipping push');
    return { success: 0, failure: tokens.length, total: tokens.length };
  }

  try {
    const message = {
      tokens,
      notification: {
        title: payload.title || 'Notification',
        body: payload.body || '',
      },
      data: payload.data || {},
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          channelId: 'nexus_channel',
          priority: 'high',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            'content-available': 1,
          },
        },
        headers: {
          'apns-priority': '10',
        },
      },
      webpush: {
        notification: {
          icon: '/logo192.png',
          badge: '/logo192.png',
        },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    let successCount = 0;
    let failureCount = 0;

    response.responses.forEach((res, idx) => {
      if (res.success) {
        successCount++;
      } else {
        failureCount++;

        // Handle invalid tokens
        const errorCode = res.error?.code;
        if (
          errorCode === 'messaging/registration-token-not-registered' ||
          errorCode === 'messaging/invalid-registration-token' ||
          errorCode === 'messaging/invalid-argument'
        ) {
          if (typeof onInvalidToken === 'function') {
            onInvalidToken(tokens[idx]);
          }
        }

        // Log errors for debugging
        if (res.error) {
          console.warn(`[PushService] Token ${idx} failed:`, res.error.code, res.error.message);
        }
      }
    });

    console.log(`[PushService] Sent: ${successCount}/${tokens.length} successful`);

    return {
      success: successCount,
      failure: failureCount,
      total: tokens.length,
    };
  } catch (err) {
    console.error('[PushService] Failed to send push notifications:', err.message);
    return {
      success: 0,
      failure: tokens.length,
      total: tokens.length,
      error: err.message,
    };
  }
}

/**
 * Send push notification to a single device
 * @param {string} token - FCM device token
 * @param {Object} payload - Notification payload
 * @returns {Promise<boolean>} Whether the notification was sent successfully
 */
async function sendSinglePush(token, payload) {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const result = await sendPush([token], payload);
  return result.success > 0;
}

/**
 * Check if Firebase is properly initialized
 * @returns {boolean}
 */
function isReady() {
  return isInitialized;
}

module.exports = {
  sendPush,
  sendSinglePush,
  initializeFirebase,
  isReady,
};
