const Category = require('../models/Category');
const Service = require('../models/Service');
const ProviderProfile = require('../models/ProviderProfile');
const SystemSetting = require('../models/SystemSetting');
const { STATUS } = require('./bookingStateMachine');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function isBroadcastToAllProvidersEnabled() {
  const setting = await SystemSetting.findOne({ key: 'booking_config' }).lean();
  return Boolean(setting?.value?.broadcastToAllProviders);
}

/**
 * Resolve all Category ObjectIds a provider is qualified to serve,
 * based on their registered primaryCategory and any active Services they own.
 */
async function getProviderMatchingCategoryIds(providerUserId, profile) {
  const categoryIds = new Set();

  if (profile && profile.primaryCategory && profile.primaryCategory.trim()) {
    const rawCat = profile.primaryCategory.trim();
    const catRegex = new RegExp(`^${escapeRegex(rawCat)}$`, 'i');
    const matchedCats = await Category.find({
      $or: [{ name: catRegex }, { slug: catRegex }],
      isActive: true,
    }).select('_id');

    for (const c of matchedCats) {
      categoryIds.add(String(c._id));
    }
  }

  const ownedServices = await Service.find({
    providerId: providerUserId,
    isActive: true,
  }).select('category');

  for (const s of ownedServices) {
    if (s.category) {
      categoryIds.add(String(s.category));
    }
  }

  return Array.from(categoryIds);
}

/**
 * Build a MongoDB query for pending_broadcast dispatches eligible for this provider:
 * - Direct bookings assigned/owned by this provider (providerId === providerUserId)
 * - Unassigned admin/platform services (providerId === null) whose category matches the provider
 */
async function buildPendingDispatchQuery(providerUserId, profile) {
  if (await isBroadcastToAllProvidersEnabled()) {
    return {
      status: STATUS.PENDING,
      'rejections.providerId': { $ne: providerUserId },
      $or: [
        { providerId: providerUserId },
        { providerId: null },
      ],
    };
  }

  const matchingCategoryIds = await getProviderMatchingCategoryIds(providerUserId, profile);

  const matchingAdminServices = matchingCategoryIds.length
    ? await Service.find({
        category: { $in: matchingCategoryIds },
        isActive: true,
      }).select('_id')
    : [];

  const matchingServiceIds = matchingAdminServices.map((s) => s._id);

  return {
    status: STATUS.PENDING,
    'rejections.providerId': { $ne: providerUserId },
    $or: [
      { providerId: providerUserId },
      {
        providerId: null,
        serviceId: { $in: matchingServiceIds },
      },
    ],
  };
}

/**
 * Validate whether a provider is eligible to accept a pending dispatch.
 */
async function canProviderAcceptBooking(booking, providerUserId, profile) {
  if (!profile || !profile.isOnline) {
    return {
      allowed: false,
      message: 'You are currently Offline. Toggle Online to accept new dispatch requests.',
    };
  }

  if (booking.providerId && String(booking.providerId) !== String(providerUserId)) {
    return {
      allowed: false,
      message: 'This service request is assigned to another provider.',
    };
  }

  if (!booking.providerId && booking.serviceId) {
    if (!(await isBroadcastToAllProvidersEnabled())) {
      const service = await Service.findById(booking.serviceId).select('category');
      if (service && service.category) {
        const matchingCatIds = await getProviderMatchingCategoryIds(providerUserId, profile);
        if (!matchingCatIds.includes(String(service.category))) {
          return {
            allowed: false,
            message: 'This service category does not match your registered service category.',
          };
        }
      }
    }
  }

  return { allowed: true };
}

/**
 * Find all online providers eligible to be notified for a newly created booking.
 */
async function getMatchingOnlineProviderIdsForBooking(booking) {
  if (booking.providerId) {
    return [booking.providerId];
  }

  if (await isBroadcastToAllProvidersEnabled()) {
    const allOnline = await ProviderProfile.find({ isOnline: true })
      .select('userId')
      .limit(200);
    return allOnline.map((p) => p.userId);
  }

  const service = await Service.findById(booking.serviceId).populate('category', 'name slug');
  if (!service || !service.category) {
    return [];
  }

  const catId = service.category._id;
  const catName = service.category.name ? String(service.category.name).trim() : '';
  const catSlug = service.category.slug ? String(service.category.slug).trim() : '';

  const ownedInCat = await Service.find({
    category: catId,
    providerId: { $ne: null },
    isActive: true,
  }).distinct('providerId');

  const orClauses = [];
  if (catName) {
    orClauses.push({ primaryCategory: new RegExp(`^${escapeRegex(catName)}$`, 'i') });
  }
  if (catSlug) {
    orClauses.push({ primaryCategory: new RegExp(`^${escapeRegex(catSlug)}$`, 'i') });
  }
  if (ownedInCat.length > 0) {
    orClauses.push({ userId: { $in: ownedInCat } });
  }

  if (orClauses.length === 0) {
    return [];
  }

  const matchingProfiles = await ProviderProfile.find({
    isOnline: true,
    $or: orClauses,
  })
    .select('userId')
    .limit(200);

  return matchingProfiles.map((p) => p.userId);
}

module.exports = {
  getProviderMatchingCategoryIds,
  buildPendingDispatchQuery,
  canProviderAcceptBooking,
  getMatchingOnlineProviderIdsForBooking,
};

