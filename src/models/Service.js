const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
    },
    machineryType: {
      type: String,
      required: true,
    },
    pricingModel: {
      type: String,
      enum: ['per_acre', 'per_hour', 'flat'],
      default: 'per_acre',
    },
    basePrice: {
      type: Number,
      required: true,
    },
    minUnits: {
      type: Number,
      default: 1,
    },
    specifications: {
      horsepower: { type: String, default: '' },
      implementWidth: { type: String, default: '' },
      fuelIncluded: { type: Boolean, default: true },
      operatorIncluded: { type: Boolean, default: true },
      turnaroundTime: { type: String, default: '' },
    },
    providerName: {
      type: String,
      default: '',
    },
    badgeTag: {
      type: String,
      default: '',
    },
    nextSlot: {
      type: String,
      default: '',
    },
    operatingArea: {
      type: String,
      default: '',
    },
    responseTime: {
      type: String,
      default: '',
    },
    features: [{ type: String }],
    rating: {
      type: Number,
      default: 0,
    },
    reviewsCount: {
      type: Number,
      default: 0,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    galleryUrls: [{ type: String }],
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdByRole: {
      type: String,
      enum: ['admin', 'provider'],
      default: 'admin',
    },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'approved',
    },
    rejectionReason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const Service = mongoose.model('Service', serviceSchema);
module.exports = Service;
