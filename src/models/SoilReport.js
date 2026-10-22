const mongoose = require('mongoose');

const soilReportSchema = new mongoose.Schema(
  {
    farmerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    parcelId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    parcelName: {
      type: String,
      default: 'Primary Parcel',
    },
    sampleId: {
      type: String,
      required: true,
      unique: true,
    },
    testDate: {
      type: Date,
      default: Date.now,
    },
    laboratory: {
      name: { type: String, default: 'Punjab Agricultural University (PAU) Testing Lab' },
      certificateNo: { type: String, default: 'PAU-SOIL-2025-089' },
      accreditation: { type: String, default: 'NABL Accredited Agri-Testing Facility' },
    },
    parameters: {
      ph: {
        value: { type: Number, default: 7.2 },
        rating: { type: String, enum: ['acidic', 'optimal', 'alkaline'], default: 'optimal' },
        idealRange: { type: String, default: '6.5 - 7.5' },
      },
      ec: {
        value: { type: Number, default: 0.45 },
        unit: { type: String, default: 'dS/m' },
        rating: { type: String, enum: ['normal', 'saline', 'critical'], default: 'normal' },
        idealRange: { type: String, default: '< 1.0 dS/m' },
      },
      organicCarbon: {
        value: { type: Number, default: 0.62 },
        unit: { type: String, default: '%' },
        rating: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
        idealRange: { type: String, default: '> 0.75%' },
      },
      nitrogen: {
        value: { type: Number, default: 215 },
        unit: { type: String, default: 'kg/ha' },
        rating: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
        idealRange: { type: String, default: '280 - 560 kg/ha' },
      },
      phosphorus: {
        value: { type: Number, default: 18.4 },
        unit: { type: String, default: 'kg/ha' },
        rating: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
        idealRange: { type: String, default: '10 - 25 kg/ha' },
      },
      potassium: {
        value: { type: Number, default: 290 },
        unit: { type: String, default: 'kg/ha' },
        rating: { type: String, enum: ['low', 'medium', 'high'], default: 'high' },
        idealRange: { type: String, default: '110 - 280 kg/ha' },
      },
      zinc: {
        value: { type: Number, default: 0.78 },
        unit: { type: String, default: 'ppm' },
        rating: { type: String, enum: ['sufficient', 'deficient'], default: 'deficient' },
      },
      iron: {
        value: { type: Number, default: 5.2 },
        unit: { type: String, default: 'ppm' },
        rating: { type: String, enum: ['sufficient', 'deficient'], default: 'sufficient' },
      },
    },
    fertilizerRecommendations: [
      {
        fertilizerName: { type: String, required: true },
        dosagePerAcre: { type: String, required: true },
        applicationTiming: { type: String, default: 'Basal application at sowing' },
        purpose: { type: String, default: 'Nutrient replenishment' },
      },
    ],
    cropSuitability: [
      {
        crop: { type: String, required: true },
        suitabilityScore: { type: Number, min: 0, max: 100, default: 90 },
        notes: { type: String, default: '' },
      },
    ],
    reportFileUrl: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

const SoilReport = mongoose.model('SoilReport', soilReportSchema);
module.exports = SoilReport;
