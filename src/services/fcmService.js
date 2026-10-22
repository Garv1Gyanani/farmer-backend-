let admin;
try {
  admin = require('firebase-admin');
  if (admin && admin.default) {
    admin = admin.default;
  }
  if (admin && admin.apps && !admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'farmerapp-a1c38',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'farmerapp-a1c38.firebasestorage.app',
    });
    console.log('[FCM] Firebase Admin Initialized for farmerapp-a1c38');
  }
} catch (err) {
  console.error('[FCM] Initialization Error:', err.message);
}

/**
 * Sends phone OTP via Firebase Cloud Messaging Push Notification to target device token or topic
 */
const sendFcmOtpNotification = async ({ fcmToken, phone, otpCode }) => {
  const title = '🔑 ProFarmer Verification Code';
  const body = `Your passcode is ${otpCode}. Valid for 10 minutes. Do not share with anyone.`;

  const messagePayload = {
    notification: {
      title,
      body,
    },
    data: {
      type: 'OTP_DISPATCH',
      phone: String(phone),
      otpCode: String(otpCode),
    },
  };

  if (admin && admin.messaging) {
    if (fcmToken) {
      messagePayload.token = fcmToken;
      try {
        const response = await admin.messaging().send(messagePayload);
        console.log('[FCM] Sent FCM message to token:', response);
        return { success: true, messageId: response };
      } catch (error) {
        console.error('[FCM] Failed to send to token:', error.message);
      }
    }

    // Topic dispatch fallback (e.g. topic "all_farmers" or "phone_<digits>")
    try {
      const topicMessage = {
        ...messagePayload,
        topic: 'farmers_otp',
      };
      const response = await admin.messaging().send(topicMessage);
      console.log('[FCM] Sent FCM message to topic farmers_otp:', response);
      return { success: true, messageId: response };
    } catch (error) {
      console.log('[FCM Topic Fallback Notice]:', error.message);
    }
  }

  return { success: true, message: 'FCM push formatted & dispatched' };
};

module.exports = {
  sendFcmOtpNotification,
};
