const express = require('express');
const router = express.Router();
const {
  getCart,
  addToCart,
  removeFromCart,
  applyCoupon,
  checkout,
  getBookingDetails,
  getLiveTracking,
  cancelBooking,
  rateBooking,
  downloadInvoice,
  downloadWorkCertificate,
  createPaymentOrder,
  verifyPayment,
} = require('../controllers/bookingController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/cart', getCart);
router.post('/cart', addToCart);
router.delete('/cart/:itemId', removeFromCart);
router.post('/cart/apply-coupon', applyCoupon);
router.post('/checkout', checkout);
router.get('/:id', getBookingDetails);
router.get('/:id/invoice', downloadInvoice);
router.get('/:id/certificate', downloadWorkCertificate);
router.get('/:id/tracking', getLiveTracking);
router.post('/:id/payment/order', createPaymentOrder);
router.post('/:id/payment/verify', verifyPayment);
router.post('/:id/cancel', cancelBooking);
router.post('/:id/rate', rateBooking);

module.exports = router;
