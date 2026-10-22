const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    userRole: {
      type: String,
      enum: ['farmer', 'agent', 'provider', 'admin'],
      required: true,
    },
    balance: {
      type: Number,
      default: 0,
    },
    pendingBalance: {
      type: Number,
      default: 0,
    },
    vestedBalance: {
      type: Number,
      default: 0,
    },
    totalEarned: {
      type: Number,
      default: 0,
    },
    totalWithdrawn: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'INR',
    },
  },
  {
    timestamps: true,
  }
);

const Wallet = mongoose.model('Wallet', walletSchema);
module.exports = Wallet;
