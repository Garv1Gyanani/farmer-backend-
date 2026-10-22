const mongoose = require('mongoose');

const commissionRecordSchema = new mongoose.Schema(
  {
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    farmerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      index: true,
    },
    bookingNumber: {
      type: String,
      required: true,
    },
    totalBookingAmount: {
      type: Number,
      required: true,
    },
    commissionPercent: {
      type: Number,
      default: 10,
    },
    commissionAmount: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'vested', 'withdrawn', 'cancelled'],
      default: 'pending',
      index: true,
    },
    vestDate: {
      type: Date,
      required: true,
    },
    vestedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const CommissionRecord = mongoose.model('CommissionRecord', commissionRecordSchema);
module.exports = CommissionRecord;
