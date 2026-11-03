const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientRole: {
      type: String,
      enum: ['farmer', 'agent', 'provider', 'admin', 'all'],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        'booking_update',
        'dispatch_alert',
        'commission_credit',
        'kyc_status',
        'payout_update',
        'weather_alert',
        'system_alert',
      ],
      default: 'system_alert',
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null,
      index: true,
    },
    // e.g. booking_created, booking_accepted, booking_rejected, work_started,
    // work_completed, completion_confirmed, booking_cancelled
    eventType: {
      type: String,
      default: '',
      index: true,
    },
    // Unique per recipient. Prevents the same event notifying the same user twice.
    dedupeKey: {
      type: String,
      default: undefined,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index(
  { recipientId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

notificationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.message = ret.body;
    return ret;
  },
});

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
