const mongoose = require('mongoose');

const otpSessionSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    otp: {
      type: String,
      required: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: '10m' }, // Auto-delete from MongoDB after 10 minutes
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OtpSession', otpSessionSchema);
