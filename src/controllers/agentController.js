const AgentProfile = require('../models/AgentProfile');
const FarmerProfile = require('../models/FarmerProfile');
const User = require('../models/User');
const Booking = require('../models/Booking');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const PayoutRequest = require('../models/PayoutRequest');
const CommissionRecord = require('../models/CommissionRecord');
const { emitToRole } = require('../socket/socketHandler');

// Agent Dashboard KPIs
const getAgentDashboard = async (req, res, next) => {
  try {
    const profile = await AgentProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Agent profile not found.' });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });

    // Count farmers
    const totalFarmers = await FarmerProfile.countDocuments({ referredByAgentId: req.user._id });
    const activeFarmers = await User.countDocuments({
      _id: { $in: await FarmerProfile.find({ referredByAgentId: req.user._id }).distinct('userId') },
      status: 'active',
    });

    const recentCommissions = await CommissionRecord.find({ agentId: req.user._id })
      .populate('farmerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      success: true,
      data: {
        agentCode: profile.agentCode,
        totalReferredFarmers: totalFarmers,
        activeFarmersCount: activeFarmers,
        wallet: {
          availableBalance: wallet ? wallet.balance : 0,
          pendingCommission: wallet ? wallet.pendingBalance : 0,
          vestedCommission: wallet ? wallet.vestedBalance : 0,
          totalEarned: wallet ? wallet.totalEarned : 0,
        },
        coverageClusters: profile.coverageClusters,
        bankDetails: profile.bankDetails,
        recentCommissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

// List referred farmers
const getReferredFarmers = async (req, res, next) => {
  try {
    const { status, search } = req.query;

    let farmerProfiles = await FarmerProfile.find({ referredByAgentId: req.user._id }).populate(
      'userId',
      'name phone email status avatarUrl createdAt'
    );

    let farmers = farmerProfiles
      .filter((fp) => fp.userId)
      .map((fp) => ({
        _id: fp.userId._id,
        profileId: fp._id,
        name: fp.userId.name,
        phone: fp.userId.phone,
        email: fp.userId.email,
        status: fp.userId.status,
        farmName: fp.farmName,
        village: fp.village,
        totalLandSize: fp.totalLandSize,
        landUnit: fp.landUnit,
        kycStatus: fp.kycStatus,
        totalBookingsCount: fp.totalBookingsCount,
        totalSpent: fp.totalSpent,
        registeredAt: fp.userId.createdAt,
      }));

    if (status && status !== 'all') {
      farmers = farmers.filter((f) => f.status === status);
    }

    if (search) {
      const q = search.toLowerCase();
      farmers = farmers.filter(
        (f) => f.name.toLowerCase().includes(q) || f.phone.includes(q) || f.village.toLowerCase().includes(q)
      );
    }

    res.status(200).json({
      success: true,
      count: farmers.length,
      farmers,
    });
  } catch (error) {
    next(error);
  }
};

// Quick Register new farmer by Agent
const registerFarmerByAgent = async (req, res, next) => {
  try {
    const { name, phone, village, tehsilBlock, district, totalLandSize, farmName } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ success: false, message: 'Name and phone are required.' });
    }

    const existingUser = await User.findOne({ phone: phone.trim() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A farmer with this phone number already exists.',
      });
    }

    const tempPassword = `pf_${phone.slice(-4)}`;
    const user = await User.create({
      name: name.trim(),
      phone: phone.trim(),
      password: tempPassword,
      role: 'farmer',
      status: 'pending_verification',
    });

    const agentProfile = await AgentProfile.findOne({ userId: req.user._id });

    const farmerProfile = await FarmerProfile.create({
      userId: user._id,
      farmName: farmName || `${name}'s Farm`,
      totalLandSize: Number(totalLandSize) || 5,
      village: village || '',
      tehsilBlock: tehsilBlock || '',
      district: district || '',
      referredByAgentId: req.user._id,
      referralCodeUsed: agentProfile ? agentProfile.agentCode : '',
      parcels: [
        {
          name: 'Main Field Parcel',
          acreage: Number(totalLandSize) || 5,
        },
      ],
    });

    await Wallet.create({
      userId: user._id,
      userRole: 'farmer',
      balance: 0,
    });

    if (agentProfile) {
      agentProfile.totalReferredFarmers += 1;
      // Increment count in cluster if matches
      if (village) {
        const cluster = agentProfile.coverageClusters.find(
          (c) => c.villageName.toLowerCase() === village.toLowerCase()
        );
        if (cluster) {
          cluster.farmerCount += 1;
        }
      }
      await agentProfile.save();
    }

    res.status(201).json({
      success: true,
      message: 'Farmer registered successfully under your referral code',
      farmer: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        status: user.status,
        farmName: farmerProfile.farmName,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get commission history and ledger
const getCommissionLedger = async (req, res, next) => {
  try {
    const records = await CommissionRecord.find({ agentId: req.user._id })
      .populate('farmerId', 'name phone')
      .populate('bookingId', 'bookingNumber scheduledDate status')
      .sort({ createdAt: -1 });

    const wallet = await Wallet.findOne({ userId: req.user._id });
    const transactions = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      wallet,
      records,
      transactions,
    });
  } catch (error) {
    next(error);
  }
};

// Request withdrawal of agent commission
const requestCommissionWithdrawal = async (req, res, next) => {
  try {
    const { amount, bankDetails } = req.body;
    const withdrawAmount = Number(amount);

    if (!withdrawAmount || withdrawAmount < 100) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is ₹100.',
      });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet || wallet.balance < withdrawAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient available balance. You have ₹${wallet ? wallet.balance : 0}.`,
      });
    }

    const agentProfile = await AgentProfile.findOne({ userId: req.user._id });
    const bank = bankDetails || (agentProfile ? agentProfile.bankDetails : null);

    if (!bank || !bank.accountNumber || !bank.ifsc) {
      return res.status(400).json({
        success: false,
        message: 'Please provide complete bank account number and IFSC code.',
      });
    }

    // Deduct available balance
    wallet.balance -= withdrawAmount;
    await wallet.save();

    const payoutCount = await PayoutRequest.countDocuments();
    const payoutNumber = `PO-${new Date().getFullYear()}-${String(payoutCount + 1).padStart(4, '0')}`;

    const payout = await PayoutRequest.create({
      payoutNumber,
      userId: req.user._id,
      userRole: 'agent',
      amount: withdrawAmount,
      bankDetails: {
        accountHolder: bank.accountHolder || req.user.name,
        accountNumber: bank.accountNumber,
        ifsc: bank.ifsc,
        bankName: bank.bankName || 'Bank Account',
      },
      status: 'pending',
    });

    await Transaction.create({
      walletId: wallet._id,
      userId: req.user._id,
      userRole: 'agent',
      type: 'payout_withdrawal',
      amount: withdrawAmount,
      balanceAfter: wallet.balance,
      status: 'pending',
      referenceType: 'payout_request',
      referenceId: payout._id,
      description: `Commission payout request #${payoutNumber}`,
    });

    // Notify Admin via Socket.IO
    emitToRole('admin', 'new_payout_request', {
      payoutId: payout._id,
      payoutNumber,
      userRole: 'agent',
      userName: req.user.name,
      amount: withdrawAmount,
      timestamp: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully. Processing typically takes 24 hours.',
      payout,
      remainingBalance: wallet.balance,
    });
  } catch (error) {
    next(error);
  }
};

// Village clusters & coverage
const getAssignedVillages = async (req, res, next) => {
  try {
    const profile = await AgentProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Agent profile not found.' });
    }

    res.status(200).json({
      success: true,
      coverageClusters: profile.coverageClusters,
    });
  } catch (error) {
    next(error);
  }
};

// Mark village visited
const markVillageVisited = async (req, res, next) => {
  try {
    const { clusterId } = req.params;
    const profile = await AgentProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Agent profile not found.' });
    }

    const cluster = profile.coverageClusters.id(clusterId);
    if (!cluster) {
      return res.status(404).json({ success: false, message: 'Coverage cluster not found.' });
    }

    const { visitNotes, latitude, longitude } = req.body;

    cluster.lastVisitedAt = new Date();
    cluster.isVisited = true;
    if (visitNotes) cluster.visitNotes = visitNotes;
    if (latitude && longitude) {
      cluster.lastLocation = {
        type: 'Point',
        coordinates: [Number(longitude), Number(latitude)],
      };
    }
    await profile.save();

    res.status(200).json({
      success: true,
      message: `Marked ${cluster.villageName} as visited.`,
      cluster,
    });
  } catch (error) {
    next(error);
  }
};

// Get individual farmer details for agent
const getFarmerDetailsForAgent = async (req, res, next) => {
  try {
    const { farmerId } = req.params;

    const user = await User.findById(farmerId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Farmer not found.' });
    }

    const farmerProfile = await FarmerProfile.findOne({ userId: farmerId });
    if (!farmerProfile) {
      return res.status(404).json({ success: false, message: 'Farmer profile not found.' });
    }

    // Bookings for this farmer
    const bookings = await Booking.find({ farmerId })
      .populate('serviceId', 'title basePrice pricingModel')
      .populate('providerId', 'name phone')
      .sort({ createdAt: -1 });

    // Commissions earned by this agent from this farmer
    const commissions = await CommissionRecord.find({
      agentId: req.user._id,
      farmerId,
    }).sort({ createdAt: -1 });

    const totalCommissionFromFarmer = commissions.reduce((sum, c) => sum + (c.commissionAmount || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        status: user.status,
        farmName: farmerProfile.farmName,
        village: farmerProfile.village,
        tehsil: farmerProfile.tehsilBlock,
        district: farmerProfile.district,
        totalLandSize: farmerProfile.totalLandSize,
        landUnit: farmerProfile.landUnit,
        kycStatus: farmerProfile.kycStatus,
        registeredAt: user.createdAt,
        parcels: farmerProfile.parcels,
        totalSpent: farmerProfile.totalSpent,
        totalCommissionFromFarmer,
        bookingsCount: bookings.length,
        bookings,
        commissions,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Get farmers in assigned village
const getVillageFarmers = async (req, res, next) => {
  try {
    const { clusterId } = req.params;
    const profile = await AgentProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Agent profile not found.' });
    }

    const cluster = profile.coverageClusters.id(clusterId);
    if (!cluster) {
      return res.status(404).json({ success: false, message: 'Coverage cluster not found.' });
    }

    // Find farmers in this village cluster
    const farmerProfiles = await FarmerProfile.find({
      $or: [
        { village: new RegExp(cluster.villageName, 'i') },
        { referredByAgentId: req.user._id },
      ],
    }).populate('userId', 'name phone status avatarUrl createdAt');

    const farmers = farmerProfiles
      .filter((fp) => fp.userId)
      .map((fp) => ({
        id: fp.userId._id,
        name: fp.userId.name,
        phone: fp.userId.phone,
        status: fp.userId.status,
        village: fp.village,
        farmName: fp.farmName,
        totalLandSize: fp.totalLandSize,
        kycStatus: fp.kycStatus,
        registeredAt: fp.userId.createdAt,
      }));

    res.status(200).json({
      success: true,
      cluster: {
        id: cluster._id,
        villageName: cluster.villageName,
        tehsil: cluster.tehsil,
        district: cluster.district,
        lastVisitedAt: cluster.lastVisitedAt,
        isVisited: cluster.isVisited,
      },
      farmersCount: farmers.length,
      farmers,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAgentDashboard,
  getReferredFarmers,
  registerFarmerByAgent,
  getCommissionLedger,
  requestCommissionWithdrawal,
  getAssignedVillages,
  markVillageVisited,
  getFarmerDetailsForAgent,
  getVillageFarmers,
};
