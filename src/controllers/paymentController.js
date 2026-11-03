const Booking = require('../models/Booking');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const {
  getKeyId,
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPaymentDetails,
} = require('../services/razorpayService');
const { emitToRole, emitToUser } = require('../socket/socketHandler');
const { sendNotificationToUser, sendPushToTopic } = require('../services/fcmService');

/**
 * 1. Get Public Razorpay Configuration for Client Apps
 */
const getPaymentConfig = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      keyId: getKeyId(),
      currency: 'INR',
      name: 'ProFarmer Agricultural Network',
      description: 'Machinery Dispatch & Precision Agri Services',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 2. Create Razorpay Order for a Booking
 */
const createBookingPaymentOrder = async (req, res, next) => {
  try {
    const { bookingId, amount, serviceTitle, acreage } = req.body;
    let totalAmount = 0;
    let receipt = `rcpt_${Date.now()}`.slice(0, 40);
    let notes = {};
    let bookingMeta = null;

    if (bookingId) {
      const booking = await Booking.findById(bookingId)
        .populate('farmerId', 'name phone email')
        .populate('serviceId', 'title');

      if (!booking) {
        return res.status(404).json({ success: false, message: 'Booking not found.' });
      }

      totalAmount = booking.pricing?.totalAmount || 0;
      if (totalAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid booking pricing amount.' });
      }

      receipt = `rcpt_${booking.bookingNumber}`.slice(0, 40);
      notes = {
        bookingId: booking._id.toString(),
        bookingNumber: booking.bookingNumber,
        serviceTitle: booking.serviceId?.title || 'Farm Machinery Service',
        farmerName: booking.farmerId?.name || '',
        farmerPhone: booking.farmerId?.phone || '',
      };
      bookingMeta = {
        _id: booking._id,
        bookingNumber: booking.bookingNumber,
        serviceTitle: booking.serviceId?.title,
        amount: totalAmount,
        acreage: booking.parcelDetails?.acreage,
        prefill: {
          name: booking.farmerId?.name || '',
          contact: booking.farmerId?.phone || '',
          email: booking.farmerId?.email || '',
        },
      };
    } else if (amount) {
      totalAmount = Number(amount);
      if (totalAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid amount.' });
      }
      notes = {
        serviceTitle: serviceTitle || 'Farm Machinery Service',
        acreage: String(acreage || 3),
        farmerId: req.user?._id?.toString() || '',
      };
    } else {
      return res.status(400).json({ success: false, message: 'bookingId or amount is required.' });
    }

    // Call Razorpay API to create live order
    const orderData = await createRazorpayOrder({
      amount: totalAmount,
      receipt,
      notes,
    });

    return res.status(200).json({
      success: true,
      message: 'Razorpay order created successfully',
      keyId: getKeyId(),
      order: orderData,
      ...(bookingMeta ? { booking: bookingMeta } : {}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 3. Verify Razorpay Payment Signature for Booking and Lock in Escrow
 */
const verifyBookingPayment = async (req, res, next) => {
  try {
    const {
      bookingId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentMethod = 'razorpay',
    } = req.body;

    if (!bookingId) {
      return res.status(400).json({ success: false, message: 'bookingId is required.' });
    }

    const booking = await Booking.findById(bookingId)
      .populate('farmerId', 'name phone')
      .populate('serviceId', 'title');

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // If signature provided, verify cryptographic authenticity
    if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      const isValid = verifyPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });

      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Razorpay payment signature verification failed. Untrusted transaction.',
        });
      }
    }

    const txnId = razorpay_payment_id || `TXN_${Date.now()}`;

    booking.payment = {
      method: paymentMethod || 'upi_intent',
      status: 'escrow_locked',
      transactionId: txnId,
      paidAt: new Date(),
    };

    booking.timeline.push({
      status: booking.status,
      note: `Payment of ₹${booking.pricing.totalAmount} authenticated via Razorpay (${txnId}). Funds locked in Agri-Escrow.`,
      updatedBy: req.user._id,
    });

    await booking.save();

    // Broadcast urgent dispatch alert to fleet operators
    emitToRole('provider', 'urgent_dispatch_available', {
      bookingId: booking._id,
      bookingNumber: booking.bookingNumber,
      serviceTitle: booking.serviceId?.title,
      acreage: booking.parcelDetails?.acreage,
      village: booking.parcelDetails?.village,
      payout: booking.pricing.providerPayoutAmount,
    });

    // Send FCM Push Notification to Farmer confirming booking & payment
    sendNotificationToUser({
      userId: booking.farmerId._id || booking.farmerId,
      title: '✅ Booking Confirmed & Secured',
      body: `Your payment of ₹${booking.pricing.totalAmount} is confirmed. We are broadcasting Booking #${booking.bookingNumber} to nearby providers.`,
      type: 'booking_update',
      data: {
        bookingId: String(booking._id),
        status: booking.status,
      },
    }).catch((err) => console.error('[FCM] Farmer booking confirmation error:', err));

    // Send FCM Push Broadcast to all Providers
    sendPushToTopic({
      topic: 'providers_broadcast',
      title: '🚨 New Machinery Request Available!',
      body: `New request: ${booking.serviceId?.title || 'Machinery'} at ${booking.parcelDetails?.village || 'nearby'} (${booking.parcelDetails?.acreage || 1} acres). Tap to accept.`,
      data: {
        bookingId: String(booking._id),
        bookingNumber: String(booking.bookingNumber),
        type: 'dispatch_alert',
      },
    }).catch((err) => console.error('[FCM] Provider broadcast error:', err));

    res.status(200).json({
      success: true,
      message: 'Razorpay payment authenticated. Funds securely locked in Agri-Escrow.',
      booking,
      transactionId: txnId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 4. Create Razorpay Order for Wallet Top-Up
 */
const createWalletTopupOrder = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 10) {
      return res.status(400).json({ success: false, message: 'Minimum wallet top-up is ₹10.' });
    }

    const receipt = `topup_${req.user._id.toString().slice(-6)}_${Date.now()}`;
    const orderData = await createRazorpayOrder({
      amount: numAmount,
      receipt,
      notes: {
        userId: req.user._id.toString(),
        type: 'wallet_topup',
      },
    });

    res.status(200).json({
      success: true,
      message: 'Wallet top-up order generated',
      keyId: getKeyId(),
      order: orderData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 5. Verify Wallet Top-Up Payment
 */
const verifyWalletTopup = async (req, res, next) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    if (razorpay_order_id && razorpay_payment_id && razorpay_signature) {
      const isValid = verifyPaymentSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });

      if (!isValid) {
        return res.status(400).json({
          success: false,
          message: 'Razorpay signature verification failed.',
        });
      }
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid top-up amount.' });
    }

    let wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      wallet = await Wallet.create({
        userId: req.user._id,
        userRole: req.user.role || 'farmer',
        balance: 0,
      });
    }

    wallet.balance += numAmount;
    await wallet.save();

    const txnId = razorpay_payment_id || `WLT_${Date.now()}`;
    await Transaction.create({
      walletId: wallet._id,
      userId: req.user._id,
      userRole: req.user.role || 'farmer',
      type: 'credit',
      amount: numAmount,
      balanceAfter: wallet.balance,
      description: `Wallet top-up via Razorpay (${txnId})`,
      referenceType: 'system_adjustment',
      status: 'completed',
    });

    res.status(200).json({
      success: true,
      message: `Successfully credited ₹${numAmount} to your wallet.`,
      walletBalance: wallet.balance,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 6. Razorpay Webhook Receiver
 */
const handleRazorpayWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).send('Missing webhook signature');
    }

    const isValid = verifyWebhookSignature(req.body, signature);
    if (!isValid) {
      console.warn('[RazorpayWebhook] Invalid webhook signature received.');
      return res.status(400).send('Invalid webhook signature');
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`[RazorpayWebhook] Received event: ${event}`);

    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payment?.entity;
      const notes = paymentEntity?.notes || {};

      if (notes.bookingId) {
        const booking = await Booking.findById(notes.bookingId);
        if (booking && booking.payment.status !== 'escrow_locked') {
          booking.payment = {
            method: paymentEntity.method || 'razorpay',
            status: 'escrow_locked',
            transactionId: paymentEntity.id,
            paidAt: new Date(),
          };
          booking.timeline.push({
            status: booking.status,
            note: `Payment confirmed by Razorpay Webhook (${paymentEntity.id}). Funds held in Agri-Escrow.`,
          });
          await booking.save();
        }
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('[RazorpayWebhook] Error handling webhook:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getPaymentConfig,
  createBookingPaymentOrder,
  verifyBookingPayment,
  createWalletTopupOrder,
  verifyWalletTopup,
  handleRazorpayWebhook,
};
