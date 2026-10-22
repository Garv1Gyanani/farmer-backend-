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
      horsepower: { type: String, default: '50-60 HP' },
      implementWidth: { type: String, default: '7-9 Feet' },
      fuelIncluded: { type: Boolean, default: true },
      operatorIncluded: { type: Boolean, default: true },
      turnaroundTime: { type: String, default: '2-4 hours / parcel' },
    },
    providerName: {
      type: String,
      default: 'Rajesh Agricultural Services',
    },
    badgeTag: {
      type: String,
      default: 'Top Pick',
    },
    nextSlot: {
      type: String,
      default: 'Available today',
    },
    operatingArea: {
      type: String,
      default: 'Kalwar & 25 km radius',
    },
    responseTime: {
      type: String,
      default: '< 30 mins',
    },
    features: [{ type: String }],
    rating: {
      type: Number,
      default: 4.8,
    },
    reviewsCount: {
      type: Number,
      default: 86,
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
  },
  {
    timestamps: true,
  }
);

const Service = mongoose.model('Service', serviceSchema);
module.exports = Service;
