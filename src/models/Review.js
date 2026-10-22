const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true,
      index: true,
    },
    farmerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      default: '',
    },
    complimentTags: [{ type: String }], // e.g. 'Fast Harvester', 'Punctual', 'Clean Furrows', 'Good Conduct'
    cropVariety: {
      type: String,
      default: '',
    },
    acreage: {
      type: Number,
      default: 0,
    },
    providerReply: {
      type: String,
      default: '',
    },
    repliedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Review = mongoose.model('Review', reviewSchema);
module.exports = Review;
