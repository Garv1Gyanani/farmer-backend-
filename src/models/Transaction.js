const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userRole: {
      type: String,
      enum: ['farmer', 'agent', 'provider', 'admin'],
      required: true,
    },
    type: {
      type: String,
      enum: [
        'credit',
        'debit',
        'escrow_hold',
        'escrow_release',
        'commission_earned',
        'commission_vested',
        'payout_withdrawal',
        'refund',
        'platform_fee',
      ],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'reversed'],
      default: 'completed',
      index: true,
    },
    referenceType: {
      type: String,
      enum: ['booking', 'payout_request', 'referral_reward', 'system_adjustment'],
      default: 'booking',
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    description: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Transaction = mongoose.model('Transaction', transactionSchema);
module.exports = Transaction;
