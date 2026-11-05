const mongoose = require('mongoose');

const payoutRequestSchema = new mongoose.Schema(
  {
    payoutNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
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
      enum: ['agent', 'provider'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 100,
    },
    payoutMethod: {
      type: String,
      enum: ['bank', 'upi'],
      default: 'bank',
    },
    upiId: {
      type: String,
      default: '',
    },
    bankDetails: {
      accountHolder: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifsc: { type: String, default: '' },
      bankName: { type: String, default: 'Primary Commercial Bank' },
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'processed'],
      default: 'pending',
      index: true,
    },
    adminNotes: {
      type: String,
      default: '',
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    utrReference: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const PayoutRequest = mongoose.model('PayoutRequest', payoutRequestSchema);
module.exports = PayoutRequest;
