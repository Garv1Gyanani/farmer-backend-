const express = require('express');
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  registerFcmToken,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.use((req, res, next) => {
  console.log(`[FCM-ROUTES] Incoming ${req.method} to notification route: ${req.originalUrl}`);
  next();
});

router.post('/register-token', protect, registerFcmToken);

router.use(protect);

router.get('/', getNotifications);
router.put('/:id/read', markAsRead);
router.put('/read-all', markAllAsRead);

module.exports = router;
