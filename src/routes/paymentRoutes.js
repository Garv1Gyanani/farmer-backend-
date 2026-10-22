const express = require('express');
const router = express.Router();
const {
  getPaymentConfig,
  createBookingPaymentOrder,
  verifyBookingPayment,
  createWalletTopupOrder,
  verifyWalletTopup,
  handleRazorpayWebhook,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');

// Public Razorpay client configuration (Key ID & Currency)
router.get('/config', getPaymentConfig);

// Booking payments via Razorpay
router.post('/booking/order', protect, createBookingPaymentOrder);
router.post('/booking/verify', protect, verifyBookingPayment);

// Wallet top-up via Razorpay
router.post('/wallet/topup/order', protect, createWalletTopupOrder);
router.post('/wallet/topup/verify', protect, verifyWalletTopup);

// Razorpay Webhook receiver
router.post('/webhook', handleRazorpayWebhook);

module.exports = router;
