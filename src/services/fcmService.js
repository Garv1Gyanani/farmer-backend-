const fs = require('fs');
const path = require('path');
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

let firebaseApp = null;
let messaging = null;

try {
  if (!getApps().length) {
    const serviceAccountPath = path.resolve(__dirname, '../../config/firebase-service-account.json');
    let serviceAccount = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (e) {
        // In case it was base64 encoded
        serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
      }
    } else if (fs.existsSync(serviceAccountPath)) {
      serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    }

    if (serviceAccount) {
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.project_id || 'farmer-app-cad87',
      });
      console.log(`[FCM] Firebase Admin initialized with service account (${serviceAccount.project_id || 'farmer-app-cad87'}).`);
    } else {
      firebaseApp = initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || 'farmer-app-cad87',
      });
      console.log('[FCM] Firebase Admin initialized with default project ID.');
    }
  } else {
    firebaseApp = getApps()[0];
  }

  if (firebaseApp) {
    messaging = getMessaging(firebaseApp);
  }
} catch (err) {
  console.error('[FCM] Initialization Error:', err.message);
}

/**
 * Send push notification to a specific device FCM token
 */
const sendPushToToken = async ({ token, title, body, data = {} }) => {
  if (!messaging || !token) {
    return { success: false, message: 'Messaging not initialized or token missing' };
  }

  const stringifiedData = {};
  for (const [key, val] of Object.entries(data)) {
    stringifiedData[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
  }

  const message = {
    notification: {
      title,
      body,
    },
    data: stringifiedData,
    token,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'profarmer_general',
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
  };

  try {
    const response = await messaging.send(message);
    return { success: true, messageId: response };
  } catch (error) {
    console.error('[FCM] Error sending push to token:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification to multiple device tokens (multicast)
 */
const sendPushToTokens = async ({ tokens, title, body, data = {} }) => {
  if (!messaging || !tokens || !tokens.length) {
    return { success: false, message: 'No tokens provided' };
  }

  const validTokens = [...new Set(tokens.filter(Boolean))];
  if (!validTokens.length) return { success: false, message: 'No valid tokens' };

  const stringifiedData = {};
  for (const [key, val] of Object.entries(data)) {
    stringifiedData[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
  }

  const multicastMessage = {
    notification: {
      title,
      body,
    },
    data: stringifiedData,
    tokens: validTokens,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'profarmer_general',
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
  };

  try {
    const response = await messaging.sendEachForMulticast(multicastMessage);
    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error('[FCM] Error sending multicast push:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send push notification to a topic (e.g., 'providers_broadcast')
 */
const sendPushToTopic = async ({ topic, title, body, data = {} }) => {
  if (!messaging || !topic) {
    return { success: false, message: 'No topic provided' };
  }

  const stringifiedData = {};
  for (const [key, val] of Object.entries(data)) {
    stringifiedData[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
  }

  const message = {
    notification: {
      title,
      body,
    },
    data: stringifiedData,
    topic,
  };

  try {
    const response = await messaging.send(message);
    return { success: true, messageId: response };
  } catch (error) {
    console.error(`[FCM] Error sending push to topic ${topic}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * High-level helper: Send push notification to a specific User ID
 * Also persists notification into MongoDB Notification collection
 */
const sendNotificationToUser = async ({ userId, title, body, type = 'booking_update', data = {} }) => {
  try {
    const User = require('../models/User');
    const Notification = require('../models/Notification');

    const user = await User.findById(userId);
    if (!user) return { success: false, message: 'User not found' };

    // 1. Create DB notification record
    await Notification.create({
      recipientId: user._id,
      recipientRole: user.role,
      title,
      body,
      type,
      data,
    });

    // 2. Dispatch FCM to all user's registered devices
    const tokens = (user.fcmTokens || []).map((t) => t.token).filter(Boolean);
    if (tokens.length > 0) {
      await sendPushToTokens({
        tokens,
        title,
        body,
        data: {
          ...data,
          type,
          notificationId: String(user._id),
        },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('[FCM] Error in sendNotificationToUser:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Sends phone OTP via Firebase Cloud Messaging Push Notification
 */
const sendFcmOtpNotification = async ({ fcmToken, phone, otpCode }) => {
  const title = '🔑 ProFarmer Verification Code';
  const body = `Your passcode is ${otpCode}. Valid for 10 minutes. Do not share with anyone.`;

  return await sendPushToToken({
    token: fcmToken,
    title,
    body,
    data: {
      type: 'OTP_DISPATCH',
      phone: String(phone),
      otpCode: String(otpCode),
    },
  });
};

module.exports = {
  firebaseApp,
  messaging,
  sendPushToToken,
  sendPushToTokens,
  sendPushToTopic,
  sendNotificationToUser,
  sendFcmOtpNotification,
};
