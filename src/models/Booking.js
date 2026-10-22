const mongoose = require('mongoose');

const bookingTimelineSchema = new mongoose.Schema({
  status: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  note: { type: String, default: '' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      index: true,
    },
    farmerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    agentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    parcelDetails: {
      name: { type: String, default: 'Primary Parcel' },
      acreage: { type: Number, required: true },
      cropType: { type: String, default: 'Wheat / Paddy' },
      village: { type: String, default: '' },
      tehsil: { type: String, default: '' },
      district: { type: String, default: '' },
      approachRoadNotes: { type: String, default: '' },
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [75.8573, 30.901] }, // [lng, lat]
      },
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    timeSlot: {
      type: String,
      enum: ['morning', 'afternoon', 'full_day'],
      default: 'morning',
    },
    status: {
      type: String,
      enum: [
        'pending_broadcast',
        'assigned',
        'en_route',
        'arrived',
        'in_progress',
        'completed',
        'cancelled',
      ],
      default: 'pending_broadcast',
      index: true,
    },
    startOtp: {
      type: String,
      required: true,
      length: 4,
    },
    pricing: {
      unitPrice: { type: Number, required: true },
      units: { type: Number, required: true },
      baseAmount: { type: Number, required: true },
      couponDiscount: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      taxes: { type: Number, default: 0 },
      totalAmount: { type: Number, required: true },
      agentCommissionAmount: { type: Number, default: 0 },
      providerPayoutAmount: { type: Number, default: 0 },
    },
    payment: {
      method: {
        type: String,
        enum: ['upi', 'upi_intent', 'card', 'wallet', 'kcc', 'netbanking', 'cash_post_service', 'razorpay'],
        default: 'upi',
      },
      status: {
        type: String,
        enum: ['pending', 'escrow_locked', 'paid_on_completion', 'settled', 'refunded'],
        default: 'pending',
      },
      transactionId: { type: String, default: '' },
      paidAt: { type: Date },
    },
    liveTracking: {
      latitude: { type: Number, default: 30.901 },
      longitude: { type: Number, default: 75.8573 },
      heading: { type: Number, default: 0 },
      speed: { type: Number, default: 0 },
      estimatedArrival: { type: Date },
      updatedAt: { type: Date, default: Date.now },
    },
    completionSignoff: {
      acreageWorked: { type: Number },
      operatorNotes: { type: String, default: '' },
      fieldPhotoUrl: { type: String, default: '' },
      farmerSignature: { type: String, default: '' },
      completedAt: { type: Date },
      farmerRating: { type: Number },
      farmerReview: { type: String },
    },
    timeline: [bookingTimelineSchema],
    cancellationReason: { type: String, default: '' },
  },
  {
    timestamps: true,
  }
);

bookingSchema.index({ 'parcelDetails.location': '2dsphere' });

const Booking = mongoose.model('Booking', bookingSchema);
module.exports = Booking;
