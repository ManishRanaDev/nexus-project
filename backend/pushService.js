const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FCM_PROJECT_ID,
            clientEmail: process.env.FCM_CLIENT_EMAIL,
            privateKey: process.env.FCM_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
    });
}

async function sendPush(tokens, payload, onInvalidToken) {
    if (!Array.isArray(tokens) || tokens.length === 0) return;

    const response = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: {
            title: payload.title,
            body: payload.body
        },
        data: payload.data || {},
        apns: {
            payload: {
                aps: {
                    sound: "default",
                    badge: 1
                }
            }
        }
    });

    response.responses.forEach((res, idx) => {
        if (
            !res.success &&
            res.error &&
            res.error.code === "messaging/registration-token-not-registered"
        ) {
            if (typeof onInvalidToken === 'function') {
                onInvalidToken(tokens[idx]);
            }
        }
    });
}

module.exports = { sendPush };
