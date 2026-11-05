const User = require('../models/User');
const FarmerProfile = require('../models/FarmerProfile');
const AgentProfile = require('../models/AgentProfile');
const ProviderProfile = require('../models/ProviderProfile');
const Booking = require('../models/Booking');
const PayoutRequest = require('../models/PayoutRequest');
const Transaction = require('../models/Transaction');
const CommissionRecord = require('../models/CommissionRecord');
const Service = require('../models/Service');
const Category = require('../models/Category');
const AuditLog = require('../models/AuditLog');
const Wallet = require('../models/Wallet');
const Notification = require('../models/Notification');
const SoilReport = require('../models/SoilReport');
const SystemSetting = require('../models/SystemSetting');
const {
  getKeyId,
  getKeySecret,
  getWebhookSecret,
  setDynamicConfig,
} = require('../services/razorpayService');
const { emitToUser, broadcastEvent } = require('../socket/socketHandler');
const { normalizePhone, getPhoneVariants } = require('../utils/phoneHelper');
const { sendNotificationToUser } = require('../services/fcmService');

// 1. Dashboard KPI Overview
const getDashboardKpis = async (req, res, next) => {
  try {
    const totalFarmers = await User.countDocuments({ role: 'farmer' });
    const totalAgents = await User.countDocuments({ role: 'agent' });
    const totalProviders = await User.countDocuments({ role: 'provider' });
    const activeUsers = await User.countDocuments({ status: 'active' });

    // Pending verifications
    const pendingFarmerKyc = await FarmerProfile.countDocuments({ kycStatus: 'pending' });
    const pendingAgentKyc = await AgentProfile.countDocuments({ kycStatus: 'pending' });
    const pendingProviderKyc = await ProviderProfile.countDocuments({ kycStatus: 'pending' });
    const totalPendingVerifications = pendingFarmerKyc + pendingAgentKyc + pendingProviderKyc;

    // Active field operations
    const activeBookings = await Booking.countDocuments({
      status: { $in: ['pending_broadcast', 'assigned', 'in_progress', 'completion_pending'] },
    });
    const completedBookings = await Booking.countDocuments({ status: 'completed' });
    const totalBookings = await Booking.countDocuments();

    // Financial Metrics
    const bookingsData = await Booking.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          totalGmv: { $sum: '$pricing.totalAmount' },
          totalPlatformRevenue: { $sum: '$pricing.platformFee' },
          totalAgentCommissions: { $sum: '$pricing.agentCommissionAmount' },
          totalProviderPayouts: { $sum: '$pricing.providerPayoutAmount' },
        },
      },
    ]);

    const financials = bookingsData[0] || {
      totalGmv: 0,
      totalPlatformRevenue: 0,
      totalAgentCommissions: 0,
      totalProviderPayouts: 0,
    };

    // Pending payouts
    const pendingPayoutsCount = await PayoutRequest.countDocuments({ status: 'pending' });

    // Online providers right now
    const onlineProviders = await ProviderProfile.countDocuments({ isOnline: true });

    // Recent activities (audit + bookings)
    const recentBookings = await Booking.find()
      .populate('farmerId', 'name phone')
      .populate('providerId', 'name phone')
      .populate('serviceId', 'title')
      .sort({ createdAt: -1 })
      .limit(6);

    const recentAuditLogs = await AuditLog.find().sort({ createdAt: -1 }).limit(6);

    // Service statistics by category
    const services = await Service.find().populate('category', 'name slug');
    const categoryStatsMap = {};
    services.forEach((s) => {
      const catName = s.category?.name || 'General Agri';
      if (!categoryStatsMap[catName]) categoryStatsMap[catName] = { count: 0, avgPrice: 0, totalPrice: 0 };
      categoryStatsMap[catName].count += 1;
      categoryStatsMap[catName].totalPrice += s.basePrice || 0;
    });
    const serviceStatistics = Object.entries(categoryStatsMap).map(([name, stat]) => ({
      categoryName: name,
      machineryCount: stat.count,
      avgPrice: Math.round(stat.totalPrice / (stat.count || 1)),
    }));

    // Transactions metrics
    const totalTransactions = await Transaction.countDocuments();
    const transactionAggregate = await Transaction.aggregate([
      { $group: { _id: null, totalVolume: { $sum: '$amount' } } },
    ]);
    const totalTransactionVolume = transactionAggregate[0]?.totalVolume || 0;

    // Monthly charts data - strictly real data
    const monthlyCharts = [];

    res.status(200).json({
      success: true,
      kpis: {
        users: {
          totalFarmers,
          totalAgents,
          totalProviders,
          totalUsers: totalFarmers + totalAgents + totalProviders,
          activeUsers,
          onlineProviders,
        },
        operations: {
          activeBookings,
          completedBookings,
          totalBookings,
          pendingVerifications: totalPendingVerifications,
          pendingPayouts: pendingPayoutsCount,
        },
        financials: {
          grossMerchandiseValue: financials.totalGmv,
          platformRevenue: financials.totalPlatformRevenue,
          agentCommissions: financials.totalAgentCommissions,
          providerPayouts: financials.totalProviderPayouts,
        },
        transactions: {
          totalCount: totalTransactions,
          totalVolume: totalTransactionVolume,
        },
        serviceStatistics,
        charts: monthlyCharts,
      },
      recentBookings,
      recentAuditLogs,
    });
  } catch (error) {
    next(error);
  }
};

// 2. Verification Queue: Get all pending items
const getVerificationQueue = async (req, res, next) => {
  try {
    const { role = 'all' } = req.query;

    let farmers = [];
    let agents = [];
    let providers = [];

    if (role === 'all' || role === 'farmer') {
      const farmerProfiles = await FarmerProfile.find({ kycStatus: { $in: ['pending', 'action_needed'] } })
        .populate('userId', 'name phone email status createdAt')
        .populate('referredByAgentId', 'name phone email');
      farmers = farmerProfiles.filter((f) => f.userId);
    }

    if (role === 'all' || role === 'agent') {
      const agentProfiles = await AgentProfile.find({ kycStatus: { $in: ['pending', 'action_needed'] } }).populate(
        'userId',
        'name phone email status createdAt'
      );
      agents = agentProfiles.filter((a) => a.userId);
    }

    if (role === 'all' || role === 'provider') {
      const providerProfiles = await ProviderProfile.find({
        kycStatus: { $in: ['pending', 'action_needed'] },
      }).populate('userId', 'name phone email status createdAt');
      providers = providerProfiles.filter((p) => p.userId);
    }

    res.status(200).json({
      success: true,
      counts: {
        farmers: farmers.length,
        agents: agents.length,
        providers: providers.length,
        total: farmers.length + agents.length + providers.length,
      },
      queue: {
        farmers,
        agents,
        providers,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 3. Review & Update User Verification (Approve, Reject, Request Info)
const processVerification = async (req, res, next) => {
  try {
    const { userRole, targetId } = req.params; // targetId can be profileId or userId
    const { action, reason, remarks } = req.body; // action: 'approve' | 'reject' | 'action_needed'

    if (!['approve', 'reject', 'action_needed'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be "approve", "reject", or "action_needed".',
      });
    }

    let user = null;
    let targetProfile = null;

    if (userRole === 'farmer') {
      targetProfile = await FarmerProfile.findOne({
        $or: [{ _id: targetId.match(/^[0-9a-fA-F]{24}$/) ? targetId : null }, { userId: targetId }],
      });
      if (targetProfile) user = await User.findById(targetProfile.userId);
    } else if (userRole === 'agent') {
      targetProfile = await AgentProfile.findOne({
        $or: [{ _id: targetId.match(/^[0-9a-fA-F]{24}$/) ? targetId : null }, { userId: targetId }],
      });
      if (targetProfile) user = await User.findById(targetProfile.userId);
    } else if (userRole === 'provider') {
      targetProfile = await ProviderProfile.findOne({
        $or: [{ _id: targetId.match(/^[0-9a-fA-F]{24}$/) ? targetId : null }, { userId: targetId }],
      });
      if (targetProfile) user = await User.findById(targetProfile.userId);
    }

    if (!targetProfile || !user) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }

    if (action === 'approve') {
      targetProfile.kycStatus = 'approved';
      targetProfile.kycVerifiedAt = new Date();
      targetProfile.kycRejectionReason = '';
      user.status = 'active';

      // Mark all documents approved
      if (targetProfile.kycDocuments) {
        targetProfile.kycDocuments.forEach((doc) => {
          doc.status = 'approved';
          doc.verifiedAt = new Date();
        });
      }
    } else if (action === 'reject') {
      targetProfile.kycStatus = 'rejected';
      targetProfile.kycRejectionReason = reason || 'Documentation failed verification criteria.';
      user.status = 'rejected';
    } else if (action === 'action_needed') {
      targetProfile.kycStatus = 'action_needed';
      targetProfile.kycRejectionReason = reason || remarks || 'Additional documentation requested by reviewer.';
      user.status = 'action_needed';
    }

    await targetProfile.save();
    await user.save();

    // Log admin audit action
    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: `KYC_${action.toUpperCase()}`,
      targetType: userRole,
      targetId: user._id,
      details: { action, reason, remarks },
      ipAddress: req.ip || '',
    });

    // Notify user via Socket.IO & notification record & FCM push
    const notifTitle =
      action === 'approve'
        ? 'Account Verified & Activated!'
        : action === 'reject'
          ? 'Verification Unsuccessful'
          : 'Action Required on Verification';

    const notifBody =
      action === 'approve'
        ? 'Congratulations! Your ProFarmer account is verified & activated. You can now log in and book farm services.'
        : `Verification notice: ${targetProfile.kycRejectionReason}`;

    // Send push notification to user
    try {
      await sendNotificationToUser({
        userId: user._id,
        title: notifTitle,
        body: notifBody,
        type: 'kyc_status',
        data: { status: user.status, kycStatus: targetProfile.kycStatus },
      });
    } catch (fcmErr) {
      console.error('[FCM] Error notifying user of KYC change:', fcmErr.message);
    }

    emitToUser(user._id, 'kyc_status_updated', {
      kycStatus: targetProfile.kycStatus,
      message: notifBody,
    });

    // If this was a referred farmer and is approved, notify the referring agent!
    if (userRole === 'farmer' && targetProfile.referredByAgentId && action === 'approve') {
      try {
        await sendNotificationToUser({
          userId: targetProfile.referredByAgentId,
          title: '✅ Farmer Referral Approved!',
          body: `Great news! ${user.name} has been verified and approved by admin. You will earn commissions on their bookings!`,
          type: 'system_alert',
          data: { type: 'referral_approved', farmerId: user._id.toString() },
        });
      } catch (agentFcmErr) {
        console.error('[FCM] Error notifying agent of farmer approval:', agentFcmErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: `KYC verification marked as ${action.toUpperCase()}`,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        status: user.status,
      },
      profile: targetProfile,
    });
  } catch (error) {
    next(error);
  }
};

// 4. Farmer Management Table
const getFarmersList = async (req, res, next) => {
  try {
    const { search, status, district, page = 1, limit = 20 } = req.query;

    let query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [{ name: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }];
    }

    const total = await User.countDocuments({ role: 'farmer', ...query });
    const users = await User.find({ role: 'farmer', ...query })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // Get profiles and wallets for these users
    const userIds = users.map((u) => u._id);
    const profiles = await FarmerProfile.find({ userId: { $in: userIds } }).populate('referredByAgentId', 'name phone');
    const wallets = await Wallet.find({ userId: { $in: userIds } });
    const allFarmerBookings = await Booking.find({ farmerId: { $in: userIds } });

    const profileMap = new Map();
    profiles.forEach((p) => profileMap.set(p.userId.toString(), p));

    const walletMap = new Map();
    wallets.forEach((w) => walletMap.set(w.userId.toString(), w));

    const bookingStatsMap = new Map();
    allFarmerBookings.forEach((b) => {
      const fId = b.farmerId.toString();
      const current = bookingStatsMap.get(fId) || { count: 0, spent: 0 };
      current.count += 1;
      current.spent += b.pricing?.totalAmount || 0;
      bookingStatsMap.set(fId, current);
    });

    const farmers = users.map((u) => {
      const p = profileMap.get(u._id.toString());
      const w = walletMap.get(u._id.toString());
      const bStats = bookingStatsMap.get(u._id.toString()) || { count: 0, spent: 0 };

      return {
        _id: u._id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        status: u.status,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
        farmName: p ? p.farmName : 'N/A',
        totalLandSize: p ? p.totalLandSize : 0,
        landUnit: p ? p.landUnit : 'acres',
        village: p ? p.village : '',
        tehsilBlock: p ? p.tehsilBlock : '',
        district: p ? p.district : '',
        kycStatus: p ? p.kycStatus : 'pending',
        kycDocuments: p ? p.kycDocuments : [],
        referredBy: p && p.referredByAgentId ? p.referredByAgentId.name : null,
        referredByAgentId: p && p.referredByAgentId ? p.referredByAgentId._id : null,
        totalBookingsCount: Math.max(p?.totalBookingsCount || 0, bStats.count),
        totalSpent: Math.max(p?.totalSpent || 0, bStats.spent),
        walletBalance: w ? w.balance : 0,
        parcels: p ? p.parcels : [],
      };
    });

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      farmers,
    });
  } catch (error) {
    next(error);
  }
};

// 5. Agent Management Table
const getAgentsList = async (req, res, next) => {
  try {
    const { search, status } = req.query;

    let query = { role: 'agent' };
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [{ name: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }];
    }

    const users = await User.find(query).sort({ createdAt: -1 });
    const userIds = users.map((u) => u._id);

    const profiles = await AgentProfile.find({ userId: { $in: userIds } });
    const wallets = await Wallet.find({ userId: { $in: userIds } });

    const profileMap = new Map();
    profiles.forEach((p) => profileMap.set(p.userId.toString(), p));

    const walletMap = new Map();
    wallets.forEach((w) => walletMap.set(w.userId.toString(), w));

    const agents = users.map((u) => {
      const p = profileMap.get(u._id.toString());
      const w = walletMap.get(u._id.toString());

      return {
        _id: u._id,
        name: u.name,
        phone: u.phone,
        email: u.email,
        status: u.status,
        agentCode: p ? p.agentCode : 'N/A',
        kycStatus: p ? p.kycStatus : 'pending',
        coverageClusters: p ? p.coverageClusters : [],
        totalReferredFarmers: p ? p.totalReferredFarmers : 0,
        activeFarmersCount: p ? p.activeFarmersCount : 0,
        availableCommission: w ? w.balance : 0,
        pendingCommission: w ? w.pendingBalance : 0,
        vestedCommission: w ? w.vestedBalance : 0,
        totalEarned: w ? w.totalEarned : 0,
        bankDetails: p ? p.bankDetails : {},
        createdAt: u.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      count: agents.length,
      agents,
    });
  } catch (error) {
    next(error);
  }
};

// 6. Service Provider Management Table
const getProvidersList = async (req, res, next) => {
  try {
    const { search, status, isOnline } = req.query;

    let userQuery = { role: 'provider' };
    if (status && status !== 'all') {
      userQuery.status = status;
    }
    if (search) {
      userQuery.$or = [{ name: new RegExp(search, 'i') }, { phone: new RegExp(search, 'i') }];
    }

    const users = await User.find(userQuery).sort({ createdAt: -1 });
    const userIds = users.map((u) => u._id);

    let profileQuery = { userId: { $in: userIds } };
    if (isOnline !== undefined) {
      profileQuery.isOnline = isOnline === 'true';
    }

    const profiles = await ProviderProfile.find(profileQuery);
    const wallets = await Wallet.find({ userId: { $in: userIds } });

    const profileMap = new Map();
    profiles.forEach((p) => profileMap.set(p.userId.toString(), p));

    const walletMap = new Map();
    wallets.forEach((w) => walletMap.set(w.userId.toString(), w));

    const providers = users
      .filter((u) => profileMap.has(u._id.toString()))
      .map((u) => {
        const p = profileMap.get(u._id.toString());
        const w = walletMap.get(u._id.toString());

        return {
          _id: u._id,
          name: u.name,
          phone: u.phone,
          email: u.email,
          status: u.status,
          contractorId: p.contractorId,
          enterpriseName: p.enterpriseName,
          primaryCategory: p.primaryCategory,
          serviceTags: p.serviceTags,
          isOnline: p.isOnline,
          coverageRadiusKm: p.coverageRadiusKm,
          machineryFleet: p.machineryFleet,
          metrics: p.metrics,
          earnings: p.earnings,
          availableBalance: w ? w.balance : 0,
          kycStatus: p.kycStatus,
          kycDocuments: p.kycDocuments,
          bankDetails: p.bankDetails,
          createdAt: u.createdAt,
        };
      });

    res.status(200).json({
      success: true,
      count: providers.length,
      providers,
    });
  } catch (error) {
    next(error);
  }
};

// 7. Toggle User Status (Active / Suspended)
const toggleUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { status, reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const targetStatus = status === 'approved' ? 'active' : status;
    user.status = targetStatus;
    await user.save();

    if (targetStatus === 'active') {
      if (user.role === 'farmer') {
        await FarmerProfile.updateOne({ userId: user._id }, { kycStatus: 'approved', kycVerifiedAt: new Date() });
      } else if (user.role === 'agent') {
        await AgentProfile.updateOne({ userId: user._id }, { kycStatus: 'approved', kycVerifiedAt: new Date() });
      } else if (user.role === 'provider') {
        await ProviderProfile.updateOne({ userId: user._id }, { kycStatus: 'approved', kycVerifiedAt: new Date() });
      }
    }

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: targetStatus === 'suspended' ? 'USER_SUSPENDED' : 'USER_ACTIVATED',
      targetType: user.role,
      targetId: user._id,
      details: { status: targetStatus, reason },
    });

    res.status(200).json({
      success: true,
      message: `User status changed to ${targetStatus}`,
      user,
    });
  } catch (error) {
    next(error);
  }
};

// 8. Bookings & Operations Management
const getAllBookings = async (req, res, next) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    let query = {};
    if (status && status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [{ bookingNumber: new RegExp(search, 'i') }, { 'parcelDetails.village': new RegExp(search, 'i') }];
    }

    const total = await Booking.countDocuments(query);
    const bookings = await Booking.find(query)
      .populate('farmerId', 'name phone email role village tehsil district')
      .populate('providerId', 'name phone email role businessName')
      .populate('agentId', 'name phone email role')
      .populate('serviceId', 'title machineryType description pricingModel category')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      bookings,
    });
  } catch (error) {
    next(error);
  }
};

// 9. Payout Requests Management
const getPayoutRequests = async (req, res, next) => {
  try {
    const { status = 'all' } = req.query;

    let query = {};
    if (status !== 'all') {
      query.status = status;
    }

    const payouts = await PayoutRequest.find(query)
      .populate('userId', 'name phone email role')
      .populate('processedBy', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: payouts.length,
      payouts,
    });
  } catch (error) {
    next(error);
  }
};

// 10. Process Payout (Approve / Reject)
const processPayoutRequest = async (req, res, next) => {
  try {
    const { payoutId } = req.params;
    const { action, utrReference, adminNotes } = req.body; // action: 'approve' | 'reject'

    const payout = await PayoutRequest.findById(payoutId).populate('userId');
    if (!payout) {
      return res.status(404).json({ success: false, message: 'Payout request not found.' });
    }

    if (payout.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Payout request is already ${payout.status}.`,
      });
    }

    const wallet = await Wallet.findOne({ userId: payout.userId._id });

    if (action === 'approve') {
      payout.status = 'processed';
      payout.processedBy = req.user._id;
      payout.processedAt = new Date();
      payout.utrReference = utrReference || `UTR-${Date.now()}`;
      payout.adminNotes = adminNotes || 'Approved and processed via bank transfer.';

      if (wallet) {
        wallet.totalWithdrawn += payout.amount;
        await wallet.save();
      }

      await Transaction.findOneAndUpdate(
        { referenceId: payout._id, type: 'payout_withdrawal' },
        { status: 'completed', metadata: { utr: payout.utrReference } }
      );

      // Notify User
      await Notification.create({
        recipientId: payout.userId._id,
        recipientRole: payout.userRole,
        title: 'Payout Processed Successfully!',
        body: `₹${payout.amount} has been transferred to your bank account (UTR: ${payout.utrReference}).`,
        type: 'payout_update',
      });

      emitToUser(payout.userId._id, 'payout_completed', {
        amount: payout.amount,
        utr: payout.utrReference,
      });
    } else if (action === 'reject') {
      payout.status = 'rejected';
      payout.processedBy = req.user._id;
      payout.processedAt = new Date();
      payout.adminNotes = adminNotes || 'Payout request rejected by administration.';

      // Refund deducted balance back to user wallet
      if (wallet) {
        wallet.balance += payout.amount;
        await wallet.save();
      }

      await Transaction.findOneAndUpdate(
        { referenceId: payout._id, type: 'payout_withdrawal' },
        { status: 'reversed', balanceAfter: wallet ? wallet.balance : 0 }
      );

      await Notification.create({
        recipientId: payout.userId._id,
        recipientRole: payout.userRole,
        title: 'Payout Request Declined',
        body: `Your withdrawal of ₹${payout.amount} was returned to your balance. Note: ${payout.adminNotes}`,
        type: 'payout_update',
      });
    }

    await payout.save();

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: action === 'approve' ? 'PAYOUT_APPROVED' : 'PAYOUT_REJECTED',
      targetType: 'payout',
      targetId: payout._id,
      details: { amount: payout.amount, action, utrReference, adminNotes },
    });

    res.status(200).json({
      success: true,
      message: `Payout request marked as ${action.toUpperCase()}`,
      payout,
    });
  } catch (error) {
    next(error);
  }
};

// 11. Global Ledger & Transactions
const getAllTransactions = async (req, res, next) => {
  try {
    const { userRole, type, userId, page = 1, limit = 50 } = req.query;

    let query = {};
    if (userRole && userRole !== 'all') query.userRole = userRole;
    if (type && type !== 'all') query.type = type;
    if (userId) query.userId = userId;

    const total = await Transaction.countDocuments(query);
    const transactions = await Transaction.find(query)
      .populate('userId', 'name phone role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      transactions,
    });
  } catch (error) {
    next(error);
  }
};

// 12. Service Catalog Management (Add/Edit Service)
const createOrUpdateService = async (req, res, next) => {
  try {
    const { id } = req.params; // If id provided, update, else create
    const {
      title,
      category,
      description,
      machineryType,
      pricingModel,
      basePrice,
      minUnits,
      specifications,
      providerName,
      badgeTag,
      nextSlot,
      operatingArea,
      responseTime,
      features,
      rating,
      reviewsCount,
      isFeatured,
      isActive,
      imageUrl,
    } = req.body;

    let service;
    if (id) {
      service = await Service.findById(id);
      if (!service) return res.status(404).json({ success: false, message: 'Service not found.' });

      if (title) service.title = title;
      if (category) service.category = category;
      if (description) service.description = description;
      if (machineryType) service.machineryType = machineryType;
      if (pricingModel) service.pricingModel = pricingModel;
      if (basePrice !== undefined) service.basePrice = Number(basePrice);
      if (minUnits !== undefined) service.minUnits = Number(minUnits);
      if (specifications) service.specifications = { ...service.specifications, ...specifications };
      if (providerName !== undefined) service.providerName = providerName;
      if (badgeTag !== undefined) service.badgeTag = badgeTag;
      if (nextSlot !== undefined) service.nextSlot = nextSlot;
      if (operatingArea !== undefined) service.operatingArea = operatingArea;
      if (responseTime !== undefined) service.responseTime = responseTime;
      if (features !== undefined) service.features = features;
      if (rating !== undefined) service.rating = Number(rating);
      if (reviewsCount !== undefined) service.reviewsCount = Number(reviewsCount);
      if (isFeatured !== undefined) service.isFeatured = isFeatured;
      if (isActive !== undefined) service.isActive = isActive;
      if (imageUrl !== undefined) service.imageUrl = imageUrl;
      if (req.body.approvalStatus !== undefined) service.approvalStatus = req.body.approvalStatus;
      if (req.body.rejectionReason !== undefined) service.rejectionReason = req.body.rejectionReason;

      await service.save();

      await AuditLog.create({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: 'service_updated',
        targetId: service._id,
        targetType: 'service',
        details: { serviceTitle: service.title, changes: req.body },
      });
    } else {
      service = await Service.create({
        title,
        category,
        description,
        machineryType,
        pricingModel: pricingModel || 'per_acre',
        basePrice: Number(basePrice),
        minUnits: Number(minUnits) || 1,
        specifications: specifications || {},
        providerName: providerName || 'Rajesh Agricultural Services',
        badgeTag: badgeTag || 'Top Pick',
        nextSlot: nextSlot || 'Available today',
        operatingArea: operatingArea || 'Kalwar & 25 km radius',
        responseTime: responseTime || '< 30 mins',
        features: features || [],
        rating: rating !== undefined ? Number(rating) : 4.8,
        reviewsCount: reviewsCount !== undefined ? Number(reviewsCount) : 86,
        isFeatured: Boolean(isFeatured),
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        imageUrl: imageUrl || '',
      });

      await AuditLog.create({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: 'service_created',
        targetId: service._id,
        targetType: 'service',
        details: { serviceTitle: service.title },
      });
    }

    res.status(200).json({
      success: true,
      message: id ? 'Service updated successfully' : 'Service created successfully',
      service,
    });
  } catch (error) {
    next(error);
  }
};

// 12b. Delete Service
const deleteService = async (req, res, next) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    await Service.findByIdAndDelete(id);

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'service_deleted',
      targetId: id,
      targetType: 'service',
      details: { serviceTitle: service.title },
    });

    res.status(200).json({
      success: true,
      message: `Service "${service.title}" removed successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

// 12c. Review Provider Service Approval
const reviewServiceApproval = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { approvalStatus, rejectionReason } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(approvalStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid approval status.' });
    }

    const service = await Service.findById(id).populate('category');
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    service.approvalStatus = approvalStatus;
    if (approvalStatus === 'approved') {
      service.isActive = true;
      service.rejectionReason = '';
    } else if (approvalStatus === 'rejected') {
      service.isActive = false;
      service.rejectionReason = rejectionReason || 'Service did not meet platform guidelines';
    } else {
      service.isActive = false;
    }

    await service.save();

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: `service_${approvalStatus}`,
      targetId: id,
      targetType: 'service',
      details: { serviceTitle: service.title, approvalStatus, rejectionReason },
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('service_approval_updated', {
        serviceId: service._id,
        approvalStatus: service.approvalStatus,
        providerId: service.providerId,
      });
    }

    res.status(200).json({
      success: true,
      message: `Service "${service.title}" has been ${approvalStatus}.`,
      service,
    });
  } catch (error) {
    next(error);
  }
};

// 13. Audit Logs
const getAuditLogs = async (req, res, next) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(50);
    res.status(200).json({
      success: true,
      logs,
    });
  } catch (error) {
    next(error);
  }
};

// 14. Manual Commission Vesting Trigger
const triggerCommissionVesting = async (req, res, next) => {
  try {
    const { vestPendingCommissions } = require('../services/cronService');
    const result = await vestPendingCommissions();

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'MANUAL_COMMISSION_VESTING',
      targetType: 'system',
      targetId: req.user._id,
      details: result,
      ipAddress: req.ip || '',
    });

    res.status(200).json({
      success: true,
      message: `Successfully processed vesting sweep: ${result.count} commissions vested (Total: ₹${result.totalAmount.toLocaleString('en-IN')}).`,
      result,
    });
  } catch (error) {
    next(error);
  }
};

// 14. Verification History (already processed items)
const getVerificationHistory = async (req, res, next) => {
  try {
    const approvedFarmers = await FarmerProfile.find({ kycStatus: { $in: ['approved', 'rejected'] } })
      .populate('userId', 'name phone email status createdAt')
      .sort({ updatedAt: -1 })
      .limit(20);

    const approvedAgents = await AgentProfile.find({ kycStatus: { $in: ['approved', 'rejected'] } })
      .populate('userId', 'name phone email status createdAt')
      .sort({ updatedAt: -1 })
      .limit(20);

    const approvedProviders = await ProviderProfile.find({ kycStatus: { $in: ['approved', 'rejected'] } })
      .populate('userId', 'name phone email status createdAt')
      .sort({ updatedAt: -1 })
      .limit(20);

    res.status(200).json({
      success: true,
      history: {
        farmers: approvedFarmers.filter((f) => f.userId),
        agents: approvedAgents.filter((a) => a.userId),
        providers: approvedProviders.filter((p) => p.userId),
      },
    });
  } catch (error) {
    next(error);
  }
};

// 15. Admin Profile & Session details
const getAdminProfile = async (req, res, next) => {
  try {
    const admin = await User.findById(req.user._id).select('-password');
    const wallet = await Wallet.findOne({ userId: req.user._id });
    res.status(200).json({
      success: true,
      admin: {
        ...admin.toObject(),
        walletBalance: wallet?.balance || 0,
        roleTitle: 'Super Administrator',
        permissions: [
          'ALL_PERMISSIONS',
          'USER_VERIFICATION',
          'FINANCIAL_RECONCILIATION',
          'DISPATCH_OVERRIDE',
          'CATALOG_MANAGEMENT',
          'SYSTEM_AUDIT',
        ],
        activeSessions: [
          { device: 'Admin Operations Console', ip: req.ip || '127.0.0.1', lastActive: new Date(), current: true },
        ],
      },
    });
  } catch (error) {
    next(error);
  }
};

// 16. Update Admin Profile
const updateAdminProfile = async (req, res, next) => {
  try {
    const { name, email, phone, currentPassword, newPassword } = req.body;
    const admin = await User.findById(req.user._id).select('+password');

    if (currentPassword && newPassword) {
      const isMatch = await admin.comparePassword(currentPassword);
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password does not match.' });
      }
      admin.password = newPassword;
    }

    if (name) admin.name = name.trim();
    if (email) admin.email = email.trim().toLowerCase();
    if (phone) admin.phone = phone.trim();

    await admin.save();

    res.status(200).json({
      success: true,
      message: 'Admin profile updated successfully',
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        phone: admin.phone,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 17. Category Management (Add/Edit Category)
const createOrUpdateCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, iconName, imageUrl, order, isActive, equipmentTags } = req.body;

    if (!id && !name) {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    let category;
    if (id) {
      category = await Category.findById(id);
      if (!category) {
        return res.status(404).json({ success: false, message: 'Category not found.' });
      }

      if (name) {
        category.name = name.trim();
        category.slug = name
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
      }
      if (description !== undefined) category.description = description;
      if (iconName) category.iconName = iconName;
      if (imageUrl !== undefined) category.imageUrl = imageUrl;
      if (order !== undefined) category.order = Number(order);
      if (isActive !== undefined) category.isActive = Boolean(isActive);
      if (equipmentTags !== undefined) {
        category.equipmentTags = Array.isArray(equipmentTags)
          ? equipmentTags.map((t) => String(t).trim()).filter(Boolean)
          : [];
      }

      await category.save();

      await AuditLog.create({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: 'category_updated',
        targetId: category._id,
        targetType: 'service',
        details: { categoryName: category.name, changes: req.body },
      });
    } else {
      const slug = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // Check unique
      const existing = await Category.findOne({ $or: [{ name: name.trim() }, { slug }] });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Category with this name or slug already exists.' });
      }

      category = await Category.create({
        name: name.trim(),
        slug,
        description: description || '',
        iconName: iconName || 'agriculture',
        imageUrl: imageUrl || '',
        order: Number(order) || 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        equipmentTags: Array.isArray(equipmentTags)
          ? equipmentTags.map((t) => String(t).trim()).filter(Boolean)
          : [],
      });

      await AuditLog.create({
        adminId: req.user._id,
        adminEmail: req.user.email,
        action: 'category_created',
        targetId: category._id,
        targetType: 'service',
        details: { categoryName: category.name },
      });
    }

    res.status(200).json({
      success: true,
      message: id ? 'Category updated successfully' : 'Category created successfully',
      category,
    });
  } catch (error) {
    next(error);
  }
};

// 18. Delete Category
const deleteCategory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const cascade = req.query.cascade === 'true' || req.body?.cascade === true;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ success: false, message: 'Category not found.' });
    }

    // Check if any services are mapped to this category
    const servicesCount = await Service.countDocuments({ category: id });
    if (servicesCount > 0) {
      if (cascade) {
        // Cascade delete all associated services
        await Service.deleteMany({ category: id });
      } else {
        return res.status(400).json({
          success: false,
          servicesCount,
          message: `Cannot delete category: ${servicesCount} active services are currently assigned to it. Please reassign or delete those services first.`,
        });
      }
    }

    await Category.findByIdAndDelete(id);

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'category_deleted',
      targetId: id,
      targetType: 'service',
      details: {
        categoryName: category.name,
        cascadeDeletedServices: cascade ? servicesCount : 0,
      },
    });

    res.status(200).json({
      success: true,
      message: `Category "${category.name}" ${cascade && servicesCount > 0 ? `and ${servicesCount} associated service(s) ` : ''}removed successfully.`,
    });
  } catch (error) {
    next(error);
  }
};

// 19. Onboard / Create New Farmer from Admin
const createFarmer = async (req, res, next) => {
  try {
    const {
      name,
      phone,
      email,
      password = 'Password@123',
      farmName,
      totalLandSize = 5,
      landUnit = 'acres',
      village,
      tehsilBlock,
      district = 'Ludhiana',
      state = 'Punjab',
      referredByAgentId,
      kycStatus = 'approved',
      initialWalletCredit = 0,
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Farmer name and phone number are required.' });
    }

    const cleanPhone = phone.trim().startsWith('+91') ? phone.trim() : `+91${phone.trim().replace(/^0+/, '')}`;

    // Check if phone already registered
    const existing = await User.findOne({ phone: cleanPhone });
    if (existing) {
      return res.status(400).json({ success: false, message: `A user with phone ${cleanPhone} already exists.` });
    }

    // Create User
    const user = await User.create({
      name: name.trim(),
      phone: cleanPhone,
      email: email ? email.trim().toLowerCase() : '',
      password,
      role: 'farmer',
      status: 'active',
      isPhoneVerified: true,
    });

    // Create Initial Parcel
    const parcels = [
      {
        name: `${farmName || name.trim() + "'s"} Main Parcel`,
        acreage: Number(totalLandSize) || 5,
        soilType: 'Alluvial Loam',
        irrigationSource: 'Tubewell',
        coordinates: { type: 'Point', coordinates: [75.8573, 30.901] },
      },
    ];

    // Create FarmerProfile
    const profile = await FarmerProfile.create({
      userId: user._id,
      farmName: farmName ? farmName.trim() : `${name.trim()}'s Agri Farm`,
      totalLandSize: Number(totalLandSize) || 5,
      landUnit,
      village: village ? village.trim() : '',
      tehsilBlock: tehsilBlock ? tehsilBlock.trim() : '',
      district: district ? district.trim() : 'Ludhiana',
      state,
      parcels,
      referredByAgentId: referredByAgentId || null,
      kycStatus,
    });

    // Create Wallet
    const wallet = await Wallet.create({
      userId: user._id,
      userRole: 'farmer',
      balance: Number(initialWalletCredit) || 0,
    });

    if (Number(initialWalletCredit) > 0) {
      await Transaction.create({
        walletId: wallet._id,
        userId: user._id,
        userRole: 'farmer',
        type: 'credit',
        amount: Number(initialWalletCredit),
        balanceAfter: wallet.balance,
        description: 'Direct Onboarding Agricultural Incentive Credit',
        referenceType: 'system_adjustment',
        status: 'completed',
      });
    }

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'farmer_created',
      targetId: user._id,
      targetType: 'farmer',
      details: { farmerName: user.name, phone: user.phone, landSize: profile.totalLandSize },
    });

    res.status(201).json({
      success: true,
      message: `Grower "${user.name}" onboarded successfully.`,
      farmer: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        status: user.status,
        farmName: profile.farmName,
        totalLandSize: profile.totalLandSize,
        landUnit: profile.landUnit,
        village: profile.village,
        district: profile.district,
        kycStatus: profile.kycStatus,
        walletBalance: wallet.balance,
        parcels: profile.parcels,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 20. Update Farmer Profile
const updateFarmer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      email,
      status,
      farmName,
      totalLandSize,
      landUnit,
      village,
      tehsilBlock,
      district,
      kycStatus,
      referredByAgentId,
    } = req.body;

    const user = await User.findById(id);
    if (!user || user.role !== 'farmer') {
      return res.status(404).json({ success: false, message: 'Farmer not found.' });
    }

    if (name) user.name = name.trim();
    if (phone) {
      const cleanPhone = normalizePhone(phone);
      if (cleanPhone !== user.phone) {
        // Check if another duplicate record exists with cleanPhone
        const duplicate = await User.findOne({ phone: cleanPhone, _id: { $ne: user._id } });
        if (duplicate) {
          await FarmerProfile.deleteMany({ userId: duplicate._id });
          await Wallet.deleteMany({ userId: duplicate._id });
          await User.deleteOne({ _id: duplicate._id });
        }
        user.phone = cleanPhone;
      }
    }
    if (email !== undefined) user.email = email.trim().toLowerCase();

    const isNowApproved = kycStatus === 'approved' || status === 'active';
    if (status) user.status = status;
    if (isNowApproved && (!status || status === 'active')) {
      user.status = 'active';
    }

    await user.save();

    let profile = await FarmerProfile.findOne({ userId: user._id });
    if (profile) {
      if (farmName !== undefined) profile.farmName = farmName.trim();
      if (totalLandSize !== undefined) profile.totalLandSize = Number(totalLandSize);
      if (landUnit !== undefined) profile.landUnit = landUnit;
      if (village !== undefined) profile.village = village.trim();
      if (tehsilBlock !== undefined) profile.tehsilBlock = tehsilBlock.trim();
      if (district !== undefined) profile.district = district.trim();
      if (kycStatus !== undefined) profile.kycStatus = kycStatus;
      if (isNowApproved) {
        profile.kycStatus = 'approved';
        profile.kycVerifiedAt = new Date();
      }
      if (referredByAgentId !== undefined) profile.referredByAgentId = referredByAgentId || null;
      await profile.save();
    }

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'farmer_updated',
      targetId: user._id,
      targetType: 'farmer',
      details: { farmerName: user.name, changes: req.body },
    });

    res.status(200).json({
      success: true,
      message: 'Farmer profile updated successfully.',
      user,
      profile,
    });
  } catch (error) {
    next(error);
  }
};

// 21. Add Land Parcel to Farmer
const addFarmerParcel = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, acreage, soilType = 'Alluvial Loam', irrigationSource = 'Tubewell', approachRoadNotes } = req.body;

    if (!name || !acreage) {
      return res.status(400).json({ success: false, message: 'Parcel name and acreage are required.' });
    }

    const profile = await FarmerProfile.findOne({ userId: id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Farmer profile not found.' });
    }

    profile.parcels.push({
      name: name.trim(),
      acreage: Number(acreage),
      soilType,
      irrigationSource,
      approachRoadNotes: approachRoadNotes || '',
      coordinates: { type: 'Point', coordinates: [75.8573, 30.901] },
    });

    // Update totalLandSize
    profile.totalLandSize = profile.parcels.reduce((sum, p) => sum + (p.acreage || 0), 0);
    await profile.save();

    res.status(201).json({
      success: true,
      message: `Land parcel "${name}" registered. Total farm size updated to ${profile.totalLandSize} acres.`,
      parcels: profile.parcels,
      totalLandSize: profile.totalLandSize,
    });
  } catch (error) {
    next(error);
  }
};

// 22. Delete Land Parcel
const deleteFarmerParcel = async (req, res, next) => {
  try {
    const { id, parcelId } = req.params;

    const profile = await FarmerProfile.findOne({ userId: id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Farmer profile not found.' });
    }

    profile.parcels = profile.parcels.filter((p) => p._id.toString() !== parcelId);
    profile.totalLandSize = profile.parcels.reduce((sum, p) => sum + (p.acreage || 0), 0);
    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Parcel removed successfully.',
      parcels: profile.parcels,
      totalLandSize: profile.totalLandSize,
    });
  } catch (error) {
    next(error);
  }
};

// 23. Credit Farmer Wallet / Direct Agri-Subsidy
const creditFarmerWallet = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, description = 'Direct Agricultural Subsidy Credit' } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid credit amount is required.' });
    }

    let wallet = await Wallet.findOne({ userId: id });
    if (!wallet) {
      wallet = await Wallet.create({ userId: id, userRole: 'farmer', balance: 0 });
    }

    wallet.balance += numAmount;
    await wallet.save();

    await Transaction.create({
      walletId: wallet._id,
      userId: id,
      userRole: 'farmer',
      type: 'credit',
      amount: numAmount,
      balanceAfter: wallet.balance,
      description,
      referenceType: 'system_adjustment',
      status: 'completed',
    });

    emitToUser(id, 'wallet_credited', {
      amount: numAmount,
      newBalance: wallet.balance,
      description,
    });

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'wallet_credited',
      targetId: id,
      targetType: 'payout',
      details: { amount: numAmount, description },
    });

    res.status(200).json({
      success: true,
      message: `Credited ₹${numAmount.toLocaleString()} to farmer wallet. New balance: ₹${wallet.balance.toLocaleString()}`,
      walletBalance: wallet.balance,
    });
  } catch (error) {
    next(error);
  }
};

// 24. Get Full 360° Farmer Dossier
const getFarmerDossier = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'Farmer not found.' });
    }

    const profile = await FarmerProfile.findOne({ userId: id }).populate('referredByAgentId', 'name phone email');
    const wallet = await Wallet.findOne({ userId: id });
    const transactions = await Transaction.find({ userId: id }).sort({ createdAt: -1 });
    const bookings = await Booking.find({ farmerId: id })
      .populate('serviceId', 'title machineryType pricingModel basePrice imageUrl')
      .sort({ createdAt: -1 });
    const soilReports = await SoilReport.find({ farmerId: id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      dossier: {
        user,
        profile,
        wallet: wallet ? { balance: wallet.balance, currency: 'INR' } : { balance: 0, currency: 'INR' },
        transactions,
        bookings,
        soilReports,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 25. Commission Records
const getCommissionRecords = async (req, res, next) => {
  try {
    const { status, agentId, page = 1, limit = 50 } = req.query;
    let query = {};
    if (status && status !== 'all') query.status = status;
    if (agentId) query.agentId = agentId;

    const total = await CommissionRecord.countDocuments(query);
    const commissions = await CommissionRecord.find(query)
      .populate('agentId', 'name phone')
      .populate('farmerId', 'name phone')
      .populate('bookingId', 'bookingNumber pricing scheduledDate status')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.status(200).json({
      success: true,
      total,
      commissions,
    });
  } catch (error) {
    next(error);
  }
};

// 26. Onboard Agent
const createAgent = async (req, res, next) => {
  try {
    const {
      name,
      phone,
      email,
      password = 'Password@123',
      villages = ['Samrala Rural', 'Machhiwara Hub'],
      district = 'Ludhiana',
      kycStatus = 'approved',
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Agent name and phone number are required.' });
    }

    const cleanPhone = phone.trim().startsWith('+91') ? phone.trim() : `+91${phone.trim().replace(/^0+/, '')}`;

    const existing = await User.findOne({ phone: cleanPhone });
    if (existing) {
      return res.status(400).json({ success: false, message: `User with phone ${cleanPhone} already exists.` });
    }

    const user = await User.create({
      name: name.trim(),
      phone: cleanPhone,
      email: email ? email.trim().toLowerCase() : '',
      password,
      role: 'agent',
      status: 'active',
      isPhoneVerified: true,
    });

    const agentCode = `AG-${Math.floor(1000 + Math.random() * 9000)}`;

    const coverageClusters = (Array.isArray(villages) ? villages : [villages]).map((v) => ({
      villageName: typeof v === 'string' ? v.trim() : v.villageName,
      district,
      farmerCount: 0,
    }));

    const profile = await AgentProfile.create({
      userId: user._id,
      agentCode,
      coverageClusters,
      kycStatus,
    });

    await Wallet.create({
      userId: user._id,
      userRole: 'agent',
      balance: 0,
    });

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'agent_created',
      targetId: user._id,
      targetType: 'agent',
      details: { agentName: user.name, agentCode, phone: user.phone },
    });

    res.status(201).json({
      success: true,
      message: `Field Agent "${user.name}" (${agentCode}) onboarded successfully.`,
      agent: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        agentCode: profile.agentCode,
        coverageClusters: profile.coverageClusters,
        kycStatus: profile.kycStatus,
        status: user.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 27. Update Agent
const updateAgent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, email, status, kycStatus, villages, district } = req.body;

    const user = await User.findById(id);
    if (!user || user.role !== 'agent') {
      return res.status(404).json({ success: false, message: 'Agent not found.' });
    }

    if (name) user.name = name.trim();
    if (phone) {
      const cleanPhone = phone.trim().startsWith('+91') ? phone.trim() : `+91${phone.trim().replace(/^0+/, '')}`;
      user.phone = cleanPhone;
    }
    if (email !== undefined) user.email = email.trim().toLowerCase();
    if (status) user.status = status;
    await user.save();

    let profile = await AgentProfile.findOne({ userId: user._id });
    if (profile) {
      if (kycStatus) profile.kycStatus = kycStatus;
      if (villages) {
        profile.coverageClusters = (Array.isArray(villages) ? villages : [villages]).map((v) => ({
          villageName: typeof v === 'string' ? v.trim() : v.villageName,
          district: district || profile.coverageClusters[0]?.district || 'Jaipur',
        }));
      }
      await profile.save();
    }

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'agent_updated',
      targetId: user._id,
      targetType: 'agent',
      details: { agentName: user.name, changes: req.body },
    });

    res.status(200).json({
      success: true,
      message: 'Agent updated successfully.',
      user,
      profile,
    });
  } catch (error) {
    next(error);
  }
};

// 28. Onboard Provider Fleet
const createProvider = async (req, res, next) => {
  try {
    const {
      name,
      phone,
      email,
      password = 'Password@123',
      enterpriseName,
      primaryCategory = 'Land Preparation & Tillage',
      coverageRadiusKm = 25,
      machineryType = 'Tractor 4WD',
      machineryModel = 'John Deere 5310 4WD',
      regPlateNumber = 'PB-10-AZ-1122',
      horsepower = 55,
      kycStatus = 'approved',
    } = req.body;

    if (!name || !phone || !enterpriseName) {
      return res.status(400).json({ success: false, message: 'Owner name, phone, and enterprise name are required.' });
    }

    const cleanPhone = phone.trim().startsWith('+91') ? phone.trim() : `+91${phone.trim().replace(/^0+/, '')}`;

    const existing = await User.findOne({ phone: cleanPhone });
    if (existing) {
      return res.status(400).json({ success: false, message: `User with phone ${cleanPhone} already exists.` });
    }

    const user = await User.create({
      name: name.trim(),
      phone: cleanPhone,
      email: email ? email.trim().toLowerCase() : '',
      password,
      role: 'provider',
      status: 'active',
      isPhoneVerified: true,
    });

    const contractorId = `PRV-${Math.floor(1000 + Math.random() * 9000)}`;

    const fleet = [
      {
        machineryType,
        model: machineryModel,
        horsepower: Number(horsepower) || 55,
        year: 2023,
        regPlateNumber,
        implements: ['Disc Harrow', 'Rotavator'],
        isAvailable: true,
      },
    ];

    const profile = await ProviderProfile.create({
      userId: user._id,
      contractorId,
      enterpriseName: enterpriseName.trim(),
      primaryCategory,
      coverageRadiusKm: Number(coverageRadiusKm) || 25,
      fleet,
      isOnline: true,
      kycStatus,
    });

    await Wallet.create({
      userId: user._id,
      userRole: 'provider',
      balance: 0,
    });

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'provider_created',
      targetId: user._id,
      targetType: 'provider',
      details: { enterpriseName: profile.enterpriseName, contractorId },
    });

    res.status(201).json({
      success: true,
      message: `Fleet Provider "${profile.enterpriseName}" (${contractorId}) onboarded successfully.`,
      provider: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        contractorId: profile.contractorId,
        enterpriseName: profile.enterpriseName,
        fleet: profile.fleet,
        isOnline: profile.isOnline,
        status: user.status,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 29. Update Provider
const updateProvider = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, email, status, enterpriseName, coverageRadiusKm, isOnline, kycStatus } = req.body;

    const user = await User.findById(id);
    if (!user || user.role !== 'provider') {
      return res.status(404).json({ success: false, message: 'Provider not found.' });
    }

    if (name) user.name = name.trim();
    if (phone) {
      const cleanPhone = phone.trim().startsWith('+91') ? phone.trim() : `+91${phone.trim().replace(/^0+/, '')}`;
      user.phone = cleanPhone;
    }
    if (email !== undefined) user.email = email.trim().toLowerCase();
    if (status) user.status = status;
    await user.save();

    let profile = await ProviderProfile.findOne({ userId: user._id });
    if (profile) {
      if (enterpriseName) profile.enterpriseName = enterpriseName.trim();
      if (coverageRadiusKm !== undefined) profile.coverageRadiusKm = Number(coverageRadiusKm);
      if (isOnline !== undefined) profile.isOnline = Boolean(isOnline);
      if (kycStatus) profile.kycStatus = kycStatus;
      await profile.save();
    }

    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'provider_updated',
      targetId: user._id,
      targetType: 'provider',
      details: { enterpriseName: profile?.enterpriseName, changes: req.body },
    });

    res.status(200).json({
      success: true,
      message: 'Provider updated successfully.',
      user,
      profile,
    });
  } catch (error) {
    next(error);
  }
};

const getRazorpaySettings = async (req, res, next) => {
  try {
    const setting = await SystemSetting.findOne({ key: 'razorpay' });
    const currentKeyId = getKeyId();
    const currentSecret = getKeySecret();
    const currentWebhook = getWebhookSecret();

    const maskedSecret = currentSecret && currentSecret.length > 8
      ? `${currentSecret.slice(0, 4)}${'*'.repeat(currentSecret.length - 8)}${currentSecret.slice(-4)}`
      : '********';

    res.status(200).json({
      success: true,
      settings: {
        keyId: setting?.value?.keyId || currentKeyId,
        keySecretMasked: maskedSecret,
        webhookSecret: setting?.value?.webhookSecret || currentWebhook,
        isLiveMode: setting?.value?.isLiveMode !== undefined
          ? setting.value.isLiveMode
          : currentKeyId.startsWith('rzp_live'),
        updatedAt: setting?.updatedAt || null,
        isConfiguredInDb: Boolean(setting?.value?.keyId),
      },
    });
  } catch (error) {
    next(error);
  }
};

const updateRazorpaySettings = async (req, res, next) => {
  try {
    const { keyId, keySecret, webhookSecret, isLiveMode } = req.body;

    if (!keyId || !keyId.trim().startsWith('rzp_')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Razorpay Key ID. Must start with rzp_test_ or rzp_live_.',
      });
    }

    let existingSetting = await SystemSetting.findOne({ key: 'razorpay' });
    const effectiveSecret = (keySecret && keySecret.trim().length > 0 && !keySecret.includes('*'))
      ? keySecret.trim()
      : (existingSetting?.value?.keySecret || getKeySecret());

    const payload = {
      keyId: keyId.trim(),
      keySecret: effectiveSecret,
      webhookSecret: webhookSecret?.trim() || getWebhookSecret(),
      isLiveMode: Boolean(isLiveMode !== undefined ? isLiveMode : keyId.startsWith('rzp_live')),
    };

    const setting = await SystemSetting.findOneAndUpdate(
      { key: 'razorpay' },
      { value: payload, updatedBy: req.user._id },
      { upsert: true, new: true }
    );

    // Apply immediately to runtime Razorpay instance
    setDynamicConfig(payload);

    // Audit log
    await AuditLog.create({
      action: 'UPDATE_RAZORPAY_KEYS',
      adminId: req.user._id,
      details: {
        keyId: payload.keyId,
        isLiveMode: payload.isLiveMode,
      },
      ipAddress: req.ip || '',
    }).catch(() => null);

    res.status(200).json({
      success: true,
      message: 'Razorpay keys updated successfully in database.',
      settings: {
        keyId: payload.keyId,
        isLiveMode: payload.isLiveMode,
        updatedAt: setting.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Send Push Broadcast or Individual Notifications from Admin Console
 */
const sendAdminNotification = async (req, res, next) => {
  try {
    const { targetType, targetRole, userId, title, body, extraData = {} } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Notification title and body are required.' });
    }

    const { sendPushToTokens, sendPushToTopic } = require('../services/fcmService');
    const Notification = require('../models/Notification');
    const User = require('../models/User');

    let recipientUsers = [];
    let dispatchType = '';

    if (targetType === 'individual') {
      if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required for individual notification.' });
      }
      const targetUser = await User.findById(userId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: 'Target user not found.' });
      }
      recipientUsers = [targetUser];
      dispatchType = `individual (${targetUser.name} - ${targetUser.role})`;
    } else if (targetType === 'role') {
      if (!['farmer', 'agent', 'provider'].includes(targetRole)) {
        return res.status(400).json({ success: false, message: 'Valid target role required: farmer, agent, or provider.' });
      }
      recipientUsers = await User.find({ role: targetRole, status: { $ne: 'suspended' } });
      dispatchType = `role: ${targetRole} (${recipientUsers.length} users)`;
    } else if (targetType === 'all') {
      recipientUsers = await User.find({ role: { $in: ['farmer', 'agent', 'provider'] }, status: { $ne: 'suspended' } });
      dispatchType = `all broadcast (${recipientUsers.length} users)`;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid targetType. Choose: individual, role, or all.' });
    }

    // 1. Create in-app notification records for all recipients in DB
    const notificationDocs = recipientUsers.map((u) => ({
      recipientId: u._id,
      recipientRole: u.role,
      title,
      body,
      type: 'system_alert',
      data: { ...extraData, sender: 'Admin Console' },
      isRead: false,
    }));

    if (notificationDocs.length > 0) {
      await Notification.insertMany(notificationDocs);
    }

    // 2. Collect all active FCM tokens
    const allTokens = [];
    recipientUsers.forEach((u) => {
      if (u.fcmTokens && Array.isArray(u.fcmTokens)) {
        u.fcmTokens.forEach((t) => {
          if (t.token) allTokens.push(t.token);
        });
      }
    });

    const uniqueTokens = [...new Set(allTokens)];
    let pushResult = { success: true, count: uniqueTokens.length };

    // 3. Dispatch multicast push via FCM
    if (uniqueTokens.length > 0) {
      pushResult = await sendPushToTokens({
        tokens: uniqueTokens,
        title,
        body,
        data: {
          type: 'system_alert',
          ...extraData,
        },
      });
    }

    // Log action to audit log
    await AuditLog.create({
      adminId: req.user._id,
      adminEmail: req.user.email,
      action: 'NOTIFICATION_BROADCAST',
      targetType: targetType === 'individual' && ['farmer', 'agent', 'provider'].includes(recipientUsers[0]?.role)
        ? recipientUsers[0].role
        : 'system',
      targetId: targetType === 'individual' && userId ? userId : req.user._id,
      details: {
        dispatchType,
        title,
        recipientsCount: recipientUsers.length,
        devicesPushed: uniqueTokens.length,
      },
    });

    res.status(200).json({
      success: true,
      message: `Notification successfully sent to ${dispatchType}!`,
      stats: {
        recipientsCount: recipientUsers.length,
        devicesPushed: uniqueTokens.length,
        pushResult,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get Notification Dispatch History & Stats for Admin Panel
 */
const getAdminNotificationHistory = async (req, res, next) => {
  try {
    const Notification = require('../models/Notification');
    const recentNotifications = await Notification.find({ type: 'system_alert' })
      .populate('recipientId', 'name phone role')
      .sort({ createdAt: -1 })
      .limit(50);

    const totalSent = await Notification.countDocuments({ type: 'system_alert' });

    res.status(200).json({
      success: true,
      totalSent,
      notifications: recentNotifications,
    });
  } catch (error) {
    next(error);
  }
};

// 28. Referral Analytics & Attribution Engine
const getReferralAnalytics = async (req, res, next) => {
  try {
    const { agentId, status, search } = req.query;

    // 1. Fetch all agents with their profiles
    const agentUsers = await User.find({ role: 'agent' }).select('name phone email status createdAt');
    const agentProfiles = await AgentProfile.find().populate('userId', 'name phone email status');

    const agentMap = new Map();
    agentUsers.forEach((a) => {
      agentMap.set(a._id.toString(), {
        _id: a._id,
        name: a.name,
        phone: a.phone,
        email: a.email,
        status: a.status,
        agentCode: '',
        assignedDistrict: '',
        assignedVillages: [],
      });
    });

    agentProfiles.forEach((ap) => {
      const uId = ap.userId?._id?.toString() || ap.userId?.toString();
      if (uId && agentMap.has(uId)) {
        const item = agentMap.get(uId);
        item.agentCode = ap.agentCode || '';
        item.assignedDistrict = ap.assignedDistrict || '';
        item.assignedVillages = ap.assignedVillages || [];
        item.profileId = ap._id;
      }
    });

    // 2. Query all farmers with referredByAgentId != null
    let farmerQuery = { referredByAgentId: { $ne: null } };
    if (agentId && agentId !== 'all') {
      farmerQuery.referredByAgentId = agentId;
    }

    const referredFarmerProfiles = await FarmerProfile.find(farmerQuery)
      .populate('userId', 'name phone email status createdAt')
      .populate('referredByAgentId', 'name phone email')
      .sort({ createdAt: -1 });

    let filteredProfiles = referredFarmerProfiles.filter((p) => p.userId);

    if (status && status !== 'all') {
      filteredProfiles = filteredProfiles.filter((p) => {
        if (status === 'pending') return p.userId.status === 'pending_verification' || p.kycStatus === 'pending';
        if (status === 'active') return p.userId.status === 'active' || p.kycStatus === 'approved';
        if (status === 'rejected') return p.userId.status === 'rejected' || p.kycStatus === 'rejected';
        return true;
      });
    }

    if (search && search.trim()) {
      const s = search.toLowerCase().trim();
      filteredProfiles = filteredProfiles.filter((p) => {
        const fName = (p.userId.name || '').toLowerCase();
        const fPhone = (p.userId.phone || '').toLowerCase();
        const aName = (p.referredByAgentId?.name || '').toLowerCase();
        const aPhone = (p.referredByAgentId?.phone || '').toLowerCase();
        const village = (p.village || '').toLowerCase();
        const district = (p.district || '').toLowerCase();
        return (
          fName.includes(s) ||
          fPhone.includes(s) ||
          aName.includes(s) ||
          aPhone.includes(s) ||
          village.includes(s) ||
          district.includes(s)
        );
      });
    }

    // 3. Compute High-Level KPIs
    const allReferred = referredFarmerProfiles.filter((p) => p.userId);
    const totalReferrals = allReferred.length;
    const pendingApprovals = allReferred.filter(
      (p) => p.userId.status === 'pending_verification' || p.kycStatus === 'pending'
    ).length;
    const activeApproved = allReferred.filter(
      (p) => p.userId.status === 'active' || p.kycStatus === 'approved'
    ).length;
    const rejectedCount = allReferred.filter(
      (p) => p.userId.status === 'rejected' || p.kycStatus === 'rejected'
    ).length;

    // Total commissions & bookings
    const commissionRecords = await CommissionRecord.find();
    const totalCommissionsEarned = commissionRecords.reduce((acc, c) => acc + (c.commissionAmount || 0), 0);
    const totalCommissionsVested = commissionRecords
      .filter((c) => c.status === 'vested')
      .reduce((acc, c) => acc + (c.commissionAmount || 0), 0);

    const referredFarmerUserIds = allReferred.map((p) => p.userId._id);
    const bookings = await Booking.find({ farmerId: { $in: referredFarmerUserIds } });
    const totalBookingGMV = bookings.reduce((acc, b) => acc + (b.pricing?.totalAmount || 0), 0);
    const totalBookingsCount = bookings.length;

    // 4. Compute Agent Performance Leaderboard
    const agentStats = [];
    agentMap.forEach((agent) => {
      const agentFarmers = allReferred.filter(
        (p) => p.referredByAgentId?._id?.toString() === agent._id.toString()
      );
      const approvedCount = agentFarmers.filter(
        (p) => p.userId.status === 'active' || p.kycStatus === 'approved'
      ).length;
      const pendingCount = agentFarmers.filter(
        (p) => p.userId.status === 'pending_verification' || p.kycStatus === 'pending'
      ).length;

      const farmerIds = agentFarmers.map((p) => p.userId._id.toString());
      const agentBookings = bookings.filter((b) => farmerIds.includes(b.farmerId.toString()));
      const gmv = agentBookings.reduce((acc, b) => acc + (b.pricing?.totalAmount || 0), 0);

      const agentComms = commissionRecords.filter((c) => c.agentId.toString() === agent._id.toString());
      const commEarned = agentComms.reduce((acc, c) => acc + (c.commissionAmount || 0), 0);

      agentStats.push({
        agentId: agent._id,
        name: agent.name,
        phone: agent.phone,
        agentCode: agent.agentCode || 'AG-N/A',
        district: agent.assignedDistrict || 'N/A',
        totalReferrals: agentFarmers.length,
        approvedReferrals: approvedCount,
        pendingReferrals: pendingCount,
        totalBookings: agentBookings.length,
        totalRevenue: gmv,
        commissionsEarned: commEarned,
      });
    });

    agentStats.sort((a, b) => b.totalReferrals - a.totalReferrals);

    // 5. Format Individual Referrals List
    const referrals = filteredProfiles.map((p) => {
      const u = p.userId;
      const a = p.referredByAgentId;
      const fBookings = bookings.filter((b) => b.farmerId.toString() === u._id.toString());
      const spend = fBookings.reduce((acc, b) => acc + (b.pricing?.totalAmount || 0), 0);

      return {
        farmerId: u._id,
        name: u.name,
        phone: u.phone,
        status: u.status,
        kycStatus: p.kycStatus || 'pending',
        farmName: p.farmName || `${u.name}'s Farm`,
        village: p.village || 'N/A',
        district: p.district || 'N/A',
        totalLandSize: p.totalLandSize || 5,
        landUnit: p.landUnit || 'acres',
        referralCodeUsed: p.referralCodeUsed || '',
        onboardedAt: u.createdAt,
        agent: a
          ? {
              agentId: a._id,
              name: a.name,
              phone: a.phone,
              agentCode: agentMap.get(a._id.toString())?.agentCode || p.referralCodeUsed || 'AG-N/A',
            }
          : null,
        totalBookings: fBookings.length,
        totalSpent: spend,
      };
    });

    res.status(200).json({
      success: true,
      summary: {
        totalReferrals,
        pendingApprovals,
        activeApproved,
        rejectedCount,
        totalBookingsCount,
        totalBookingGMV,
        totalCommissionsEarned,
        totalCommissionsVested,
      },
      agentStats,
      referrals,
      agents: Array.from(agentMap.values()),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getReferralAnalytics,
  getRazorpaySettings,
  updateRazorpaySettings,
  sendAdminNotification,
  getAdminNotificationHistory,
  getDashboardKpis,
  getVerificationQueue,
  getVerificationHistory,
  processVerification,
  getFarmersList,
  createFarmer,
  updateFarmer,
  addFarmerParcel,
  deleteFarmerParcel,
  creditFarmerWallet,
  getFarmerDossier,
  getAgentsList,
  createAgent,
  updateAgent,
  getProvidersList,
  createProvider,
  updateProvider,
  toggleUserStatus,
  getAllBookings,
  getPayoutRequests,
  processPayoutRequest,
  getAllTransactions,
  getCommissionRecords,
  createOrUpdateService,
  deleteService,
  reviewServiceApproval,
  createOrUpdateCategory,
  deleteCategory,
  getAuditLogs,
  triggerCommissionVesting,
  getAdminProfile,
  updateAdminProfile,
};
