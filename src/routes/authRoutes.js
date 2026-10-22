const express = require('express');
const router = express.Router();
const {
  register,
  login,
  requestOtp,
  verifyOtp,
  getMe,
  updateProfile,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/login', login);
router.post('/otp/request', requestOtp);
router.post('/otp/verify', verifyOtp);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

module.exports = router;
