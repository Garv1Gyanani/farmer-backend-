const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  registerFcmToken,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');
const { sendNotificationToUser } = require('../services/fcmService');

router.use((req, res, next) => {
  console.log(`[FCM-ROUTES] Incoming ${req.method} to notification route: ${req.originalUrl}`);
  next();
});

// Test notification route to trigger a push to the currently logged in user
router.post('/test', protect, async (req, res, next) => {
  try {
    const title = req.body.title || '🔔 ProFarmer Test Alert';
    const body = req.body.body || 'This is a live test notification from your ProFarmer backend!';
    const result = await sendNotificationToUser({
      userId: req.user._id,
      title,
      body,
      type: 'system_alert',
      data: { test: 'true', timestamp: new Date().toISOString() },
    });
    res.status(200).json({ success: true, message: 'Test push notification dispatched!', result });
  } catch (err) {
    next(err);
  }
});

router.post('/register-token', protect, registerFcmToken);

router.use(protect);

router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);

module.exports = router;
