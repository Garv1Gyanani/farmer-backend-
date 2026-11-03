const Booking = require('../models/Booking');
const HttpError = require('../utils/httpError');

/**
 * Booking lifecycle state machine. The database `status` field is the single source of truth.
 *
 *   PENDING            pending_broadcast
 *   ACCEPTED           assigned
 *   IN_PROGRESS        in_progress
 *   COMPLETION_PENDING completion_pending   (provider finished; farmer confirms with OTP)
 *   COMPLETED          completed
 *   REJECTED           rejected             (assigned provider declined; admin may reallocate)
 *   CANCELLED          cancelled
 */
const STATUS = Object.freeze({
  PENDING: 'pending_broadcast',
  ACCEPTED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETION_PENDING: 'completion_pending',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

const TRANSITIONS = Object.freeze({
  [STATUS.PENDING]: [STATUS.ACCEPTED, STATUS.REJECTED, STATUS.CANCELLED],
  [STATUS.ACCEPTED]: [STATUS.IN_PROGRESS, STATUS.CANCELLED],
  [STATUS.IN_PROGRESS]: [STATUS.COMPLETION_PENDING, STATUS.CANCELLED],
  [STATUS.COMPLETION_PENDING]: [STATUS.COMPLETED, STATUS.CANCELLED],
  [STATUS.REJECTED]: [STATUS.PENDING, STATUS.CANCELLED], // admin reallocation / cancellation
  [STATUS.COMPLETED]: [],
  [STATUS.CANCELLED]: [],
});

const ACTIVE_STATUSES = [
  STATUS.PENDING,
  STATUS.ACCEPTED,
  STATUS.IN_PROGRESS,
  STATUS.COMPLETION_PENDING,
];

/** Statuses in which a provider has accepted the job and is responsible for it. */
const PROVIDER_ONGOING_STATUSES = [
  STATUS.ACCEPTED,
  STATUS.IN_PROGRESS,
  STATUS.COMPLETION_PENDING,
];

const sourcesFor = (to) =>
  Object.keys(TRANSITIONS).filter((from) => TRANSITIONS[from].includes(to));

/**
 * Atomically moves a booking to `to`.
 *
 * The status guard lives inside the update filter, so two concurrent callers can never both succeed:
 * the loser matches no document and receives a 409. Every transition appends an audit entry to the
 * booking timeline.
 *
 * @param {object} opts
 * @param {string} opts.bookingId
 * @param {string} opts.to          target status
 * @param {object} opts.actor       { _id, role }
 * @param {string} opts.note        human readable timeline note
 * @param {object} [opts.filter]    extra query conditions (ownership, provider checks...)
 * @param {object} [opts.set]       extra fields to $set together with the status change
 * @param {object} [opts.unset]     fields to $unset
 * @param {object} [opts.push]      extra $push operations
 * @param {string[]} [opts.from]    restrict the allowed source statuses further
 * @param {string} [opts.select]    extra field selection on the returned document
 */
const transitionBooking = async ({
  bookingId,
  to,
  actor,
  note,
  filter = {},
  set = {},
  unset,
  push = {},
  from,
  select,
}) => {
  let allowedFrom = sourcesFor(to);
  if (from) allowedFrom = allowedFrom.filter((s) => from.includes(s));

  const update = {
    $set: { ...set, status: to },
    $push: {
      ...push,
      timeline: {
        status: to,
        note: note || '',
        updatedBy: actor?._id,
        actorRole: actor?.role || 'system',
        timestamp: new Date(),
      },
    },
  };
  if (unset) update.$unset = unset;

  let query = Booking.findOneAndUpdate(
    { _id: bookingId, status: { $in: allowedFrom }, ...filter },
    update,
    { new: true }
  );
  if (select) query = query.select(select);
  const updated = await query;
  if (updated) return updated;

  // Nothing matched: work out why so the caller gets a precise, truthful error.
  const current = await Booking.findById(bookingId).select('status providerId farmerId rejections');
  if (!current) throw new HttpError(404, 'Booking not found.');
  if (!TRANSITIONS[current.status]?.includes(to)) {
    throw new HttpError(409, `This booking cannot move from "${current.status}" to "${to}".`, {
      currentStatus: current.status,
    });
  }
  throw new HttpError(409, 'This booking is no longer available for this action.', {
    currentStatus: current.status,
  });
};

/** True when the user may see this booking. */
const canAccessBooking = (user, booking) => {
  if (!user || !booking) return false;
  if (user.role === 'admin') return true;
  const id = String(user._id);
  const farmerId = String(booking.farmerId?._id || booking.farmerId || '');
  const providerId = booking.providerId ? String(booking.providerId._id || booking.providerId) : '';
  if (user.role === 'farmer') return farmerId === id;
  if (user.role === 'provider') return providerId === id;
  if (user.role === 'agent') {
    return booking.agentId && String(booking.agentId._id || booking.agentId) === id;
  }
  return false;
};

module.exports = {
  STATUS,
  TRANSITIONS,
  ACTIVE_STATUSES,
  PROVIDER_ONGOING_STATUSES,
  transitionBooking,
  canAccessBooking,
};

