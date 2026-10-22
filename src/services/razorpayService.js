const Razorpay = require('razorpay');
const crypto = require('crypto');

/**
 * ProFarmer Razorpay Payment Gateway Service
 * Handles live order creation, payment signature verification,
 * refunds, and webhook reconciliation.
 */

const getKeyId = () => process.env.RAZORPAY_KEY_ID || 'rzp_test_TBI1orIzqpWtm9';
const getKeySecret = () => process.env.RAZORPAY_KEY_SECRET || 'foiwfCo3OpqXyUtDPr1Aibla';
const getWebhookSecret = () => process.env.RAZORPAY_WEBHOOK_SECRET || 'profarmer_razorpay_webhook_secret_2026';

let razorpayInstance = null;

const getRazorpayInstance = () => {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: getKeyId(),
      key_secret: getKeySecret(),
    });
  }
  return razorpayInstance;
};

/**
 * Create a Razorpay Order
 * @param {Object} param0
 * @param {number} param0.amount - Amount in Rupees (e.g. 2400)
 * @param {string} param0.receipt - Unique booking/receipt reference
 * @param {Object} param0.notes - Additional metadata (bookingId, farmerId, etc.)
 */
const createRazorpayOrder = async ({ amount, receipt, notes = {} }) => {
  try {
    const razorpay = getRazorpayInstance();
    const amountInPaise = Math.round(Number(amount) * 100);

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: (receipt || `rcpt_${Date.now()}`).slice(0, 40),
      notes,
    };

    const order = await razorpay.orders.create(options);

    return {
      success: true,
      orderId: order.id,
      amount: order.amount, // in paise
      amountInRupees: order.amount / 100,
      currency: order.currency,
      receipt: order.receipt,
      status: order.status,
      keyId: getKeyId(),
      notes: order.notes,
      createdAt: order.created_at,
    };
  } catch (error) {
    console.error('[RazorpayService] createOrder error:', error);
    throw new Error(error.description || error.message || 'Failed to create Razorpay order');
  }
};

/**
 * Verify Razorpay Payment Signature
 * Formula: HMAC_SHA256(order_id + "|" + payment_id, secret) == signature
 */
const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  try {
    if (!orderId || !paymentId || !signature) {
      return false;
    }

    const secret = getKeySecret();
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body.toString())
      .digest('hex');

    return expectedSignature === signature;
  } catch (err) {
    console.error('[RazorpayService] Signature verification error:', err);
    return false;
  }
};

/**
 * Verify Webhook Signature
 */
const verifyWebhookSignature = (rawBody, signature) => {
  try {
    const secret = getWebhookSecret();
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
      .digest('hex');

    return expectedSignature === signature;
  } catch (err) {
    console.error('[RazorpayService] Webhook verification error:', err);
    return false;
  }
};

/**
 * Fetch Payment Details by Payment ID
 */
const fetchPaymentDetails = async (paymentId) => {
  try {
    const razorpay = getRazorpayInstance();
    const payment = await razorpay.payments.fetch(paymentId);
    return {
      success: true,
      payment,
    };
  } catch (error) {
    console.error('[RazorpayService] fetchPayment error:', error);
    throw new Error(error.description || error.message || 'Failed to fetch Razorpay payment');
  }
};

/**
 * Initiate Refund
 */
const initiateRefund = async ({ paymentId, amount, notes = {} }) => {
  try {
    const razorpay = getRazorpayInstance();
    const payload = { notes };
    if (amount) {
      payload.amount = Math.round(Number(amount) * 100);
    }

    const refund = await razorpay.payments.refund(paymentId, payload);
    return {
      success: true,
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status,
    };
  } catch (error) {
    console.error('[RazorpayService] refund error:', error);
    throw new Error(error.description || error.message || 'Failed to process Razorpay refund');
  }
};

module.exports = {
  getKeyId,
  createRazorpayOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPaymentDetails,
  initiateRefund,
};
