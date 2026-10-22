const mongoose = require('mongoose');

const villageCoverageSchema = new mongoose.Schema({
  villageName: { type: String, required: true },
  tehsil: { type: String, default: '' },
  district: { type: String, default: '' },
  farmerCount: { type: Number, default: 0 },
  lastVisitedAt: { type: Date, default: null },
  isVisited: { type: Boolean, default: false },
});

const agentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    agentCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    coverageClusters: [villageCoverageSchema],
    totalReferredFarmers: {
      type: Number,
      default: 0,
    },
    activeFarmersCount: {
      type: Number,
      default: 0,
    },
    commissionBalance: {
      type: Number,
      default: 0,
    },
    pendingCommission: {
      type: Number,
      default: 0,
    },
    vestedCommission: {
      type: Number,
      default: 0,
    },
    totalEarnedAllTime: {
      type: Number,
      default: 0,
    },
    kycStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    bankDetails: {
      accountHolder: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifsc: { type: String, default: '' },
      bankName: { type: String, default: '' },
      isVerified: { type: Boolean, default: false },
    },
  },
  {
    timestamps: true,
  }
);

const AgentProfile = mongoose.model('AgentProfile', agentProfileSchema);
module.exports = AgentProfile;
