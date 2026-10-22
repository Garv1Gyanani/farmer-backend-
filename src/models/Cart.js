const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema({
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
  },
  parcelName: { type: String, default: 'Main Parcel' },
  acreage: { type: Number, required: true, min: 0.5 },
  scheduledDate: { type: Date, required: true },
  timeSlot: {
    type: String,
    enum: ['morning', 'afternoon', 'full_day'],
    default: 'morning',
  },
  approachRoadNotes: { type: String, default: '' },
  unitPrice: { type: Number, required: true },
  estimatedTotal: { type: Number, required: true },
});

const cartSchema = new mongoose.Schema(
  {
    farmerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    items: [cartItemSchema],
    couponCode: { type: String, default: '' },
    couponDiscount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  }
);

const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;
