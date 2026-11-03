const Booking = require('../models/Booking');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const ProviderProfile = require('../models/ProviderProfile');
const CommissionRecord = require('../models/CommissionRecord');
const { emitToUser } = require('../socket/socketHandler');
const { initiateRefund } = require('./razorpayService');

/**
 * Credits the provider (and referring agent) once a booking is COMPLETED.
 *
 * Idempotent: the payment is first "claimed" with an atomic status change, so a repeated call, or
 * two concurrent calls, can never credit the same booking twice.
 */
const settleBooking = async (bookingId) => {
  const claimed = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'completed', 'payment.status': { $in: ['escrow_locked', 'paid_on_completion', 'pending'] } },
    { $set: { 'payment.status': 'settled' } },
    { new: true }
  );
  if (!claimed) return { settled: false };

  try {
    const booking = claimed;
    const providerId = booking.providerId;
    const acres = booking.completionSignoff?.acreageWorked || booking.parcelDetails.acreage;
    const providerPayout = booking.pricing.providerPayoutAmount || booking.pricing.totalAmount * 0.85;

    if (providerId) {
      const wallet = await Wallet.findOne({ userId: providerId });
      if (wallet) {
        wallet.balance += providerPayout;
        wallet.totalEarned += providerPayout;
        await wallet.save();
        await Transaction.create({
          walletId: wallet._id,
          userId: providerId,
          userRole: 'provider',
          type: 'credit',
          amount: providerPayout,
          balanceAfter: wallet.balance,
          status: 'completed',
          referenceType: 'booking',
          referenceId: booking._id,
          description: `Earnings for completed booking #${booking.bookingNumber}`,
        });
      }

      const profile = await ProviderProfile.findOne({ userId: providerId });
      if (profile) {
        profile.earnings.today += providerPayout;
        profile.earnings.weekly += providerPayout;
        profile.earnings.monthly += providerPayout;
        profile.earnings.totalAllTime += providerPayout;
        profile.metrics.jobsCompletedToday += 1;
        profile.metrics.acreageCoveredToday += acres;
        await profile.save();
      }
    }

    if (booking.agentId) {
      const commission = booking.pricing.agentCommissionAmount || booking.pricing.totalAmount * 0.1;
      const vestDate = new Date();
      vestDate.setDate(vestDate.getDate() + 7);

      await CommissionRecord.create({
        agentId: booking.agentId,
        farmerId: booking.farmerId,
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        totalBookingAmount: booking.pricing.totalAmount,
        commissionPercent: 10,
        commissionAmount: commission,
        status: 'pending',
        vestDate,
      });

      const agentWallet = await Wallet.findOne({ userId: booking.agentId });
      if (agentWallet) {
        agentWallet.pendingBalance += commission;
        await agentWallet.save();
        await Transaction.create({
          walletId: agentWallet._id,
          userId: booking.agentId,
          userRole: 'agent',
          type: 'commission_earned',
          amount: commission,
          balanceAfter: agentWallet.balance,
          status: 'pending',
          referenceType: 'booking',
          referenceId: booking._id,
          description: `Referral commission pending vesting for booking #${booking.bookingNumber}`,
        });
      }
      emitToUser(booking.agentId, 'commission_update', {
        amount: commission,
        bookingNumber: booking.bookingNumber,
        vestDate,
      });
    }

    return { settled: true, providerPayout };
  } catch (err) {
    // Release the claim so settlement can be retried rather than silently losing the payout.
    await Booking.updateOne({ _id: bookingId }, { $set: { 'payment.status': 'escrow_locked' } });
    console.error(`[Settlement] Failed for booking ${bookingId}:`, err.message);
    throw err;
  }
};

/**
 * Returns the farmer's money after a cancellation.
 * Only reports "refunded" when Razorpay actually confirmed the refund; otherwise the booking is
 * marked "refund_pending" so finance can follow up.
 */
const refundBooking = async (bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) return { status: 'unknown' };
  if (['pending', 'refunded', 'refund_pending'].includes(booking.payment.status)) {
    return { status: booking.payment.status };
  }
  if (booking.payment.status !== 'escrow_locked') return { status: booking.payment.status };

  const paymentId = booking.payment.transactionId;
  if (!paymentId || !paymentId.startsWith('pay_')) {
    booking.payment.status = 'refund_pending';
    await booking.save();
    return { status: 'refund_pending', reason: 'No gateway payment reference on record' };
  }

  try {
    await initiateRefund({ paymentId, amount: booking.pricing.totalAmount, notes: { bookingNumber: booking.bookingNumber } });
    booking.payment.status = 'refunded';
  } catch (err) {
    console.error(`[Refund] Gateway refund failed for ${booking.bookingNumber}:`, err.message);
    booking.payment.status = 'refund_pending';
  }
  await booking.save();
  return { status: booking.payment.status };
};

module.exports = { settleBooking, refundBooking };

