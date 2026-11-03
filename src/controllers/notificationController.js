const Notification = require('../models/Notification');

// Get notifications
const getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({
      $or: [{ recipientId: req.user._id }, { recipientRole: req.user.role }, { recipientRole: 'all' }],
    })
      .sort({ createdAt: -1 })
      .limit(30);

    const unreadCount = await Notification.countDocuments({
      recipientId: req.user._id,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      unreadCount,
      notifications,
    });
  } catch (error) {
    next(error);
  }
};

// Mark as read
const markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndUpdate(id, { isRead: true });

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    next(error);
  }
};

// Mark all as read
const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ recipientId: req.user._id, isRead: false }, { isRead: true });

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    next(error);
  }
};

// Register or update FCM device token
const registerFcmToken = async (req, res, next) => {
  try {
    const { token, platform = 'android' } = req.body;
    console.log(`[FCM-DEBUG] /register-token HIT by user: ${req.user?._id} (${req.user?.name}, role: ${req.user?.role})`);
    console.log(`[FCM-DEBUG] Incoming Token: ${token?.slice(0, 25)}... (platform: ${platform})`);

    if (!token) {
      console.log('[FCM-DEBUG] Registration rejected: token missing in request body');
      return res.status(400).json({ success: false, message: 'FCM token is required.' });
    }

    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    if (!user) {
      console.log(`[FCM-DEBUG] User ${req.user._id} not found in DB`);
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (!user.fcmTokens) {
      user.fcmTokens = [];
    }

    // Check if token already exists for user
    const existingIndex = user.fcmTokens.findIndex((t) => t.token === token);
    if (existingIndex >= 0) {
      user.fcmTokens[existingIndex].updatedAt = new Date();
      user.fcmTokens[existingIndex].platform = platform;
      console.log(`[FCM-DEBUG] Updated existing token at index ${existingIndex} for user ${user.phone}`);
    } else {
      user.fcmTokens.push({ token, platform, updatedAt: new Date() });
      console.log(`[FCM-DEBUG] Stored new FCM token (total tokens for user: ${user.fcmTokens.length})`);
    }

    await user.save();

    console.log(`[FCM-DEBUG] ✅ Token saved successfully to MongoDB User [${user._id}]`);
    res.status(200).json({
      success: true,
      message: 'FCM token registered successfully.',
    });
  } catch (error) {
    console.error('[FCM-DEBUG] ❌ Exception in registerFcmToken:', error);
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  registerFcmToken,
};
