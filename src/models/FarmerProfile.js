const mongoose = require('mongoose');

const parcelSchema = new mongoose.Schema({
  name: { type: String, required: true },
  acreage: { type: Number, required: true },
  soilType: { type: String, default: 'Alluvial' },
  irrigationSource: { type: String, default: 'Tubewell' },
  approachRoadNotes: { type: String, default: '' },
  coordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [75.8573, 30.901] }, // [lng, lat]
  },
});

const kycDocumentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'identity_aadhaar',
      'identity_voter',
      'identity_license',
      'land_record_khasra',
      'land_record_khatauni',
      'farmer_id_card',
      'bank_passbook',
    ],
    required: true,
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
  verifiedAt: { type: Date },
});

const farmerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    farmName: {
      type: String,
      default: 'My Farm Parcel',
    },
    totalLandSize: {
      type: Number,
      default: 5,
    },
    landUnit: {
      type: String,
      default: 'acres',
    },
    farmingBackground: {
      type: String,
      default: 'owner_cultivator',
    },
    village: { type: String, default: '' },
    tehsilBlock: { type: String, default: '' },
    district: { type: String, default: '' },
    state: { type: String, default: 'Punjab' },
    pinCode: { type: String, default: '' },
    landmark: { type: String, default: '' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [75.8573, 30.901] }, // [lng, lat]
    },
    parcels: [parcelSchema],
    kycStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'action_needed'],
      default: 'pending',
      index: true,
    },
    kycDocuments: [kycDocumentSchema],
    kycRejectionReason: { type: String, default: '' },
    kycVerifiedAt: { type: Date },
    referredByAgentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    referralCodeUsed: { type: String, default: '' },
    totalBookingsCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

farmerProfileSchema.index({ location: '2dsphere' });

const FarmerProfile = mongoose.model('FarmerProfile', farmerProfileSchema);
module.exports = FarmerProfile;
