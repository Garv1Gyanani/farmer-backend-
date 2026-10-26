const mongoose = require('mongoose');

const machineryItemSchema = new mongoose.Schema({
  machineryType: {
    type: String,
    required: true,
  },
  model: { type: String, required: true },
  horsepower: { type: Number, default: 50 },
  year: { type: Number, default: 2023 },
  regPlateNumber: { type: String, required: true },
  implements: [{ type: String }],
  driverName: { type: String, default: '' },
  driverPhone: { type: String, default: '' },
  isAvailable: { type: Boolean, default: true },
  imageUrl: { type: String, default: '' },
});

const providerKycDocSchema = new mongoose.Schema({
  type: {
    type: String,
    default: 'identity_proof',
  },
  title: { type: String, default: '' },
  fileUrl: { type: String, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'action_needed'],
    default: 'pending',
  },
  remarks: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
});

const providerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    contractorId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    enterpriseName: {
      type: String,
      required: true,
      trim: true,
    },
    primaryCategory: {
      type: String,
      default: 'Harvesting & Mechanization',
    },
    serviceTags: [{ type: String }],
    baseDepotLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [75.8573, 30.901] }, // [lng, lat]
    },
    coverageRadiusKm: {
      type: Number,
      default: 35,
    },
    isOnline: {
      type: Boolean,
      default: false,
      index: true,
    },
    machineryFleet: [machineryItemSchema],
    businessPan: { type: String, default: '' },
    gstin: { type: String, default: '' },
    bankDetails: {
      accountHolder: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifsc: { type: String, default: '' },
      bankName: { type: String, default: '' },
      isVerified: { type: Boolean, default: false },
    },
    metrics: {
      acceptanceRate: { type: Number, default: 98.0 },
      rating: { type: Number, default: 4.9 },
      totalReviews: { type: Number, default: 0 },
      onTimeArrivalRate: { type: Number, default: 95.0 },
      equipmentUptimeIndex: { type: Number, default: 98.5 },
      jobsCompletedToday: { type: Number, default: 0 },
      operatingHoursToday: { type: Number, default: 0 },
      acreageCoveredToday: { type: Number, default: 0 },
    },
    earnings: {
      today: { type: Number, default: 0 },
      weekly: { type: Number, default: 0 },
      monthly: { type: Number, default: 0 },
      totalAllTime: { type: Number, default: 0 },
      availableBalance: { type: Number, default: 0 },
    },
    kycStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'action_needed'],
      default: 'pending',
      index: true,
    },
    kycDocuments: [providerKycDocSchema],
    kycRejectionReason: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

providerProfileSchema.index({ baseDepotLocation: '2dsphere' });

const ProviderProfile = mongoose.model('ProviderProfile', providerProfileSchema);
module.exports = ProviderProfile;
