const Notification = require('../models/Notification');
const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');
const { emitToUser, emitToRole } = require('../socket/socketHandler');
const { sendPushToTokens } = require('./fcmService');

/**
 * Event-driven notification pipeline.
 *
 * Every notification is persisted first (source of truth for the in-app inbox and badge counts),
 * then pushed live over Socket.IO, then sent as an FCM push when the recipient has device tokens.
 * A unique (recipientId, dedupeKey) index guarantees one event never notifies the same user twice.
 */

const EVENTS = Object.freeze({
  BOOKING_CREATED: 'booking_created',
  BOOKING_ACCEPTED: 'booking_accepted',
  BOOKING_REJECTED: 'booking_rejected',
  WORK_STARTED: 'work_started',
  WORK_COMPLETED: 'work_completed',
  COMPLETION_CONFIRMED: 'completion_confirmed',
  BOOKING_CANCELLED: 'booking_cancelled',
  BOOKING_REASSIGNED: 'booking_reassigned',
});

/**
 * Persist + deliver one notification to one user.
 * @returns {Promise<{created: boolean, notification?: object, push?: object}>}
 */
const notifyUser = async ({
  userId,
  bookingId,
  eventType,
  title,
  message,
  data = {},
  dedupeSuffix = '',
}) => {
  if (!userId) return { created: false };

  const user = await User.findById(userId).select('role fcmTokens');
  if (!user) return { created: false };

  const dedupeKey = `${bookingId || 'none'}:${eventType}${dedupeSuffix ? `:${dedupeSuffix}` : ''}`;

  let notification;
  try {
    notification = await Notification.create({
      recipientId: user._id,
      recipientRole: user.role,
      title,
      body: message,
      type: 'booking_update',
      bookingId: bookingId || null,
      eventType,
      dedupeKey,
      data: { ...data, bookingId: bookingId ? String(bookingId) : undefined, eventType },
    });
  } catch (err) {
    if (err.code === 11000) return { created: false }; // already notified for this event
    throw err;
  }

  emitToUser(user._id, 'notification', notification.toJSON());

  let push = { success: false, message: 'No registered devices' };
  const tokens = (user.fcmTokens || []).map((t) => t.token).filter(Boolean);
  if (tokens.length) {
    push = await sendPushToTokens({
      tokens,
      title,
      body: message,
      data: { ...data, bookingId: String(bookingId || ''), eventType, notificationId: String(notification._id) },
    });
    if (!push.success) {
      console.warn(`[Notify] Push not delivered to ${user._id}: ${push.message || push.error || 'unknown reason'}`);
    }
  }

  return { created: true, notification, push };
};

/** Notify every admin account. */
const notifyAdmins = async (payload) => {
  const admins = await User.find({ role: 'admin' }).select('_id');
  return Promise.all(admins.map((a) => notifyUser({ ...payload, userId: a._id })));
};

/** Notify the booking's provider, or all approved providers when it has not been allocated. */
const notifyProvidersForBooking = async (booking, payload) => {
  if (booking.providerId) {
    return [await notifyUser({ ...payload, userId: booking.providerId })];
  }
  const approved = await ProviderProfile.find({ kycStatus: 'approved' }).select('userId').limit(200);
  return Promise.all(approved.map((p) => notifyUser({ ...payload, userId: p.userId })));
};

/**
 * Tell every connected client that a booking changed so lists, tracking screens and the admin
 * table refresh immediately. This is a live hint only; the persisted notification is the record.
 */
const broadcastBookingUpdate = (booking, extra = {}) => {
  const payload = {
    bookingId: String(booking._id),
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    updatedAt: booking.updatedAt,
    ...extra,
  };
  emitToUser(booking.farmerId?._id || booking.farmerId, 'booking_updated', payload);
  if (booking.providerId) emitToUser(booking.providerId?._id || booking.providerId, 'booking_updated', payload);
  emitToRole('admin', 'booking_updated', payload);
  if (!booking.providerId) emitToRole('provider', 'booking_updated', payload);
};

module.exports = {
  EVENTS,
  notifyUser,
  notifyAdmins,
  notifyProvidersForBooking,
  broadcastBookingUpdate,
};

