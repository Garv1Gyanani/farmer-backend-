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
    if (!token) {
      return res.status(400).json({ success: false, message: 'FCM token is required.' });
    }

    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    if (!user) {
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
    } else {
      user.fcmTokens.push({ token, platform, updatedAt: new Date() });
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'FCM token registered successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  registerFcmToken,
};
