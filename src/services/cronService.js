const cron = require('node-cron');
const CommissionRecord = require('../models/CommissionRecord');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Notification = require('../models/Notification');
const { emitToUser } = require('../socket/socketHandler');

/**
 * Scan for matured pending commissions and vest them into Agent withdrawable wallets.
 */
const vestPendingCommissions = async () => {
  const now = new Date();
  console.log(`[CronService] [${now.toISOString()}] Running commission vesting scan...`);

  try {
    const pendingCommissions = await CommissionRecord.find({
      status: 'pending',
      vestDate: { $lte: now },
    });

    if (pendingCommissions.length === 0) {
      console.log('[CronService] No commissions due for vesting at this time.');
      return { success: true, count: 0, totalAmount: 0 };
    }

    let totalVestedAmount = 0;
    const processedIds = [];

    for (const record of pendingCommissions) {
      record.status = 'vested';
      record.vestedAt = now;
      await record.save();

      // Find or create agent wallet
      let wallet = await Wallet.findOne({ userId: record.agentId });
      if (!wallet) {
        wallet = await Wallet.create({
          userId: record.agentId,
          userRole: 'agent',
          balance: 0,
          pendingBalance: 0,
          vestedBalance: 0,
          totalEarned: 0,
          totalWithdrawn: 0,
        });
      }

      const amount = record.commissionAmount;
      wallet.pendingBalance = Math.max(0, wallet.pendingBalance - amount);
      wallet.balance += amount;
      wallet.vestedBalance += amount;
      await wallet.save();

      // Create Ledger Transaction
      await Transaction.create({
        walletId: wallet._id,
        userId: record.agentId,
        userRole: 'agent',
        type: 'commission_vested',
        amount,
        balanceAfter: wallet.balance,
        status: 'completed',
        referenceType: 'booking',
        referenceId: record.bookingId,
        description: `Commission vested for Booking #${record.bookingNumber} (${record.commissionPercent}%)`,
        metadata: {
          commissionRecordId: record._id,
          bookingNumber: record.bookingNumber,
        },
      });

      // Send In-App Notification
      await Notification.create({
        userId: record.agentId,
        userRole: 'agent',
        title: 'Commission Vested & Withdrawable! 💰',
        body: `₹${amount.toLocaleString('en-IN')} commission for Booking #${record.bookingNumber} is now vested in your wallet and available for immediate bank transfer.`,
        type: 'commission_vested',
        referenceId: record._id,
        referenceModel: 'CommissionRecord',
      });

      // Real-time Push via Socket
      try {
        emitToUser(record.agentId.toString(), 'wallet_updated', {
          balance: wallet.balance,
          vestedAmount: amount,
          bookingNumber: record.bookingNumber,
        });
      } catch (err) {
        // Socket emit failure shouldn't fail cron
      }

      totalVestedAmount += amount;
      processedIds.push(record._id);
    }

    console.log(`[CronService] Successfully vested ${processedIds.length} commissions totalling ₹${totalVestedAmount}`);
    return {
      success: true,
      count: processedIds.length,
      totalAmount: totalVestedAmount,
      commissionIds: processedIds,
    };
  } catch (error) {
    console.error('[CronService] Error vesting commissions:', error);
    throw error;
  }
};

/**
 * Initialize Background Automated Cron Jobs
 */
const initCronJobs = () => {
  // Run daily at midnight (00:00:00)
  cron.schedule('0 0 * * *', async () => {
    try {
      await vestPendingCommissions();
    } catch (err) {
      console.error('[CronService] Scheduled midnight job encountered an error:', err.message);
    }
  });

  console.log('[CronService] Automated commission vesting cron scheduler initialized (Runs daily at 00:00).');
};

module.exports = {
  initCronJobs,
  vestPendingCommissions,
};
