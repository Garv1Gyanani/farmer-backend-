const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const ProviderProfile = require('../models/ProviderProfile');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const PayoutRequest = require('../models/PayoutRequest');
const CommissionRecord = require('../models/CommissionRecord');
const AgentProfile = require('../models/AgentProfile');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const { uploadToS3 } = require('../services/s3Service');
const { emitToUser, emitToRole, emitToBooking } = require('../socket/socketHandler');

// Provider Dashboard
const getProviderDashboard = async (req, res, next) => {
  try {
    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Provider profile not found.' });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });

    // Urgent requests: bookings waiting for dispatch
    const urgentRequests = await Booking.find({
      status: 'pending_broadcast',
    })
      .populate('serviceId', 'title machineryType pricingModel basePrice')
      .populate('farmerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(5);

    // Active ongoing jobs
    const activeJobs = await Booking.find({
      providerId: req.user._id,
      status: { $in: ['assigned', 'en_route', 'arrived', 'in_progress'] },
    }).populate('serviceId');

    res.status(200).json({
      success: true,
      data: {
        isOnline: profile.isOnline,
        contractorId: profile.contractorId,
        enterpriseName: profile.enterpriseName,
        metrics: profile.metrics,
        todayEarnings: profile.earnings.today,
        availableBalance: wallet ? wallet.balance : 0,
        activeJobsCount: activeJobs.length,
        urgentRequests,
        machineryCount: profile.machineryFleet.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

// Toggle Online/Offline
const toggleOnlineStatus = async (req, res, next) => {
  try {
    const { isOnline } = req.body;
    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Provider profile not found.' });
    }

    profile.isOnline = isOnline !== undefined ? Boolean(isOnline) : !profile.isOnline;
    await profile.save();

    res.status(200).json({
      success: true,
      message: `Operational status updated to ${profile.isOnline ? 'ONLINE' : 'OFFLINE'}`,
      isOnline: profile.isOnline,
    });
  } catch (error) {
    next(error);
  }
};

// Get Fleet
const getFleet = async (req, res, next) => {
  try {
    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Provider profile not found.' });
    }

    res.status(200).json({
      success: true,
      fleet: profile.machineryFleet,
    });
  } catch (error) {
    next(error);
  }
};

// Add Machinery to Fleet
const addMachinery = async (req, res, next) => {
  try {
    const { machineryType, model, horsepower, year, regPlateNumber, implements: imps, driverName, driverPhone } =
      req.body;

    if (!machineryType || !model || !regPlateNumber) {
      return res.status(400).json({
        success: false,
        message: 'Machinery type, model, and registration plate number are required.',
      });
    }

    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Provider profile not found.' });
    }

    profile.machineryFleet.push({
      machineryType,
      model,
      horsepower: Number(horsepower) || 50,
      year: Number(year) || 2023,
      regPlateNumber,
      implements: imps || [],
      driverName: driverName || '',
      driverPhone: driverPhone || '',
      isAvailable: true,
    });

    await profile.save();

    res.status(201).json({
      success: true,
      message: 'Machinery added to fleet catalog successfully',
      fleet: profile.machineryFleet,
    });
  } catch (error) {
    next(error);
  }
};

// Get Jobs by tab
const getJobs = async (req, res, next) => {
  try {
    const { tab } = req.query; // 'new_requests', 'ongoing', 'completed'

    let query = {};
    if (tab === 'new_requests') {
      query = { status: 'pending_broadcast' };
    } else if (tab === 'ongoing') {
      query = {
        providerId: req.user._id,
        status: { $in: ['assigned', 'en_route', 'arrived', 'in_progress'] },
      };
    } else if (tab === 'completed') {
      query = {
        providerId: req.user._id,
        status: 'completed',
      };
    } else {
      query = { providerId: req.user._id };
    }

    const jobs = await Booking.find(query)
      .populate('serviceId')
      .populate('farmerId', 'name phone avatarUrl')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: jobs.length,
      jobs,
    });
  } catch (error) {
    next(error);
  }
};

// Accept Job Dispatch
const acceptJob = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (booking.status !== 'pending_broadcast') {
      return res.status(400).json({
        success: false,
        message: 'This booking is no longer available. Another provider may have accepted it.',
      });
    }

    booking.providerId = req.user._id;
    booking.status = 'assigned';
    booking.timeline.push({
      status: 'assigned',
      note: `Dispatch accepted by provider ${req.user.name}`,
      updatedBy: req.user._id,
    });

    await booking.save();

    // Notify farmer via Socket.IO
    emitToUser(booking.farmerId, 'booking_status_updated', {
      bookingId: booking._id,
      status: 'assigned',
      providerName: req.user.name,
      message: 'A machinery provider has accepted your service dispatch.',
    });

    // Notify booking room
    emitToBooking(booking._id, 'booking_assigned', {
      bookingId: booking._id,
      providerId: req.user._id,
      providerName: req.user.name,
    });

    res.status(200).json({
      success: true,
      message: 'Dispatch accepted successfully. Prepare equipment and proceed to field.',
      booking,
    });
  } catch (error) {
    next(error);
  }
};

// Update machinery dispatch status (e.g. en_route, arrived)
const updateJobStatus = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { status, note } = req.body;

    const allowedStatuses = ['en_route', 'arrived'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${allowedStatuses.join(', ')}. Use dedicated OTP endpoint for starting job.`,
      });
    }

    const booking = await Booking.findOne({ _id: bookingId, providerId: req.user._id });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found or not assigned to you.' });
    }

    booking.status = status;
    booking.timeline.push({
      status,
      note: note || `Machinery is now ${status.replace('_', ' ')}`,
      updatedBy: req.user._id,
    });

    await booking.save();

    // Emit live update
    emitToUser(booking.farmerId, 'booking_status_updated', {
      bookingId: booking._id,
      status,
      message: status === 'arrived' ? 'Provider has arrived! Please share your 4-digit OTP to start.' : 'Machinery is en-route to your parcel.',
    });

    res.status(200).json({
      success: true,
      message: `Job status updated to ${status}`,
      booking,
    });
  } catch (error) {
    next(error);
  }
};

// Verify 4-digit start OTP from farmer
const verifyStartOtp = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: '4-digit OTP is required.' });
    }

    const booking = await Booking.findOne({ _id: bookingId, providerId: req.user._id });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found or not assigned to you.' });
    }

    if (booking.startOtp !== otp.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP! Please request the correct 4-digit code shown on the farmer app.',
      });
    }

    booking.status = 'in_progress';
    booking.timeline.push({
      status: 'in_progress',
      note: 'Field operation started via OTP verification',
      updatedBy: req.user._id,
    });

    await booking.save();

    emitToUser(booking.farmerId, 'booking_status_updated', {
      bookingId: booking._id,
      status: 'in_progress',
      message: 'Field work has officially commenced! Live acreage counter active.',
    });

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully! Work has officially started.',
      booking,
    });
  } catch (error) {
    next(error);
  }
};

// Complete Job and trigger payout & commission ledger
const completeJob = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { acreageWorked, operatorNotes, fieldPhotoUrl } = req.body;

    const booking = await Booking.findOne({ _id: bookingId, providerId: req.user._id });
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found or not assigned to you.' });
    }

    if (booking.status === 'completed') {
      return res.status(400).json({ success: false, message: 'Booking has already been completed.' });
    }

    booking.status = 'completed';
    booking.completionSignoff = {
      acreageWorked: Number(acreageWorked) || booking.parcelDetails.acreage,
      operatorNotes: operatorNotes || '',
      fieldPhotoUrl: fieldPhotoUrl || '',
      completedAt: new Date(),
    };

    booking.timeline.push({
      status: 'completed',
      note: `Field operation completed. ${acreageWorked || booking.parcelDetails.acreage} acres covered.`,
      updatedBy: req.user._id,
    });

    // Financial settlements
    const providerPayout = booking.pricing.providerPayoutAmount || booking.pricing.totalAmount * 0.85;

    // Credit Provider Wallet
    let providerWallet = await Wallet.findOne({ userId: req.user._id });
    if (providerWallet) {
      providerWallet.balance += providerPayout;
      providerWallet.totalEarned += providerPayout;
      await providerWallet.save();

      await Transaction.create({
        walletId: providerWallet._id,
        userId: req.user._id,
        userRole: 'provider',
        type: 'credit',
        amount: providerPayout,
        balanceAfter: providerWallet.balance,
        status: 'completed',
        referenceType: 'booking',
        referenceId: booking._id,
        description: `Earnings for completed booking #${booking.bookingNumber}`,
      });
    }

    // Update Provider Profile metrics
    const providerProfile = await ProviderProfile.findOne({ userId: req.user._id });
    if (providerProfile) {
      providerProfile.earnings.today += providerPayout;
      providerProfile.earnings.weekly += providerPayout;
      providerProfile.earnings.monthly += providerPayout;
      providerProfile.earnings.totalAllTime += providerPayout;
      providerProfile.metrics.jobsCompletedToday += 1;
      providerProfile.metrics.acreageCoveredToday += Number(acreageWorked) || booking.parcelDetails.acreage;
      await providerProfile.save();
    }

    // Handle Agent Commission if farmer was referred
    if (booking.agentId) {
      const agentCommission = booking.pricing.agentCommissionAmount || booking.pricing.totalAmount * 0.10;
      const vestDate = new Date();
      vestDate.setDate(vestDate.getDate() + 7); // 7-day vesting period

      const commRecord = await CommissionRecord.create({
        agentId: booking.agentId,
        farmerId: booking.farmerId,
        bookingId: booking._id,
        bookingNumber: booking.bookingNumber,
        totalBookingAmount: booking.pricing.totalAmount,
        commissionPercent: 10,
        commissionAmount: agentCommission,
        status: 'pending', // unvested
        vestDate,
      });

      // Update Agent Wallet pending balance
      let agentWallet = await Wallet.findOne({ userId: booking.agentId });
      if (agentWallet) {
        agentWallet.pendingBalance += agentCommission;
        await agentWallet.save();

        await Transaction.create({
          walletId: agentWallet._id,
          userId: booking.agentId,
          userRole: 'agent',
          type: 'commission_earned',
          amount: agentCommission,
          balanceAfter: agentWallet.balance,
          status: 'pending',
          referenceType: 'booking',
          referenceId: booking._id,
          description: `Referral commission pending vesting for booking #${booking.bookingNumber}`,
        });
      }

      emitToUser(booking.agentId, 'commission_update', {
        amount: agentCommission,
        bookingNumber: booking.bookingNumber,
        vestDate,
      });
    }

    booking.payment.status = 'settled';
    await booking.save();

    // Notify farmer
    emitToUser(booking.farmerId, 'booking_status_updated', {
      bookingId: booking._id,
      status: 'completed',
      message: 'Field work has been completed! Please review and rate your service.',
    });

    res.status(200).json({
      success: true,
      message: 'Job completed successfully! Earnings credited to your wallet.',
      booking,
      payoutAmount: providerPayout,
    });
  } catch (error) {
    next(error);
  }
};

// Provider Earnings Summary
const getEarnings = async (req, res, next) => {
  try {
    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    const wallet = await Wallet.findOne({ userId: req.user._id });
    const transactions = await Transaction.find({ userId: req.user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      availableBalance: wallet ? wallet.balance : 0,
      earnings: profile ? profile.earnings : {},
      bankDetails: profile ? profile.bankDetails : {},
      transactions,
    });
  } catch (error) {
    next(error);
  }
};

// Request Payout for Provider
const requestPayout = async (req, res, next) => {
  try {
    const { amount, bankDetails } = req.body;
    const withdrawAmount = Number(amount);

    if (!withdrawAmount || withdrawAmount < 500) {
      return res.status(400).json({
        success: false,
        message: 'Minimum withdrawal amount is ₹500.',
      });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet || wallet.balance < withdrawAmount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient balance. Available: ₹${wallet ? wallet.balance : 0}`,
      });
    }

    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    const bank = bankDetails || (profile ? profile.bankDetails : null);

    if (!bank || !bank.accountNumber || !bank.ifsc) {
      return res.status(400).json({
        success: false,
        message: 'Bank account number and IFSC are required.',
      });
    }

    wallet.balance -= withdrawAmount;
    await wallet.save();

    const count = await PayoutRequest.countDocuments();
    const payoutNumber = `PO-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;

    const payout = await PayoutRequest.create({
      payoutNumber,
      userId: req.user._id,
      userRole: 'provider',
      amount: withdrawAmount,
      bankDetails: {
        accountHolder: bank.accountHolder || req.user.name,
        accountNumber: bank.accountNumber,
        ifsc: bank.ifsc,
        bankName: bank.bankName || 'Commercial Bank',
      },
      status: 'pending',
    });

    await Transaction.create({
      walletId: wallet._id,
      userId: req.user._id,
      userRole: 'provider',
      type: 'payout_withdrawal',
      amount: withdrawAmount,
      balanceAfter: wallet.balance,
      status: 'pending',
      referenceType: 'payout_request',
      referenceId: payout._id,
      description: `Provider withdrawal request #${payoutNumber}`,
    });

    emitToRole('admin', 'new_payout_request', {
      payoutId: payout._id,
      payoutNumber,
      userRole: 'provider',
      userName: req.user.name,
      amount: withdrawAmount,
      timestamp: new Date(),
    });

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully.',
      payout,
      remainingBalance: wallet.balance,
    });
  } catch (error) {
    next(error);
  }
};

// Get Reviews
const getReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ providerId: req.user._id })
      .populate('farmerId', 'name avatarUrl')
      .sort({ createdAt: -1 });

    const profile = await ProviderProfile.findOne({ userId: req.user._id });

    res.status(200).json({
      success: true,
      rating: profile ? profile.metrics.rating : 4.9,
      totalReviews: reviews.length,
      reviews,
    });
  } catch (error) {
    next(error);
  }
};

// Agricultural Demand Heatmap & Cluster Intelligence
const getDemandHeatmap = async (req, res, next) => {
  try {
    const activeBookings = await Booking.find({
      status: { $in: ['pending_broadcast', 'assigned'] },
    }).populate('serviceId', 'name machineryType');

    const clusterMap = {};

    activeBookings.forEach((b) => {
      const tehsil = b.parcelDetails?.tehsil || 'Central Valley';
      const district = b.parcelDetails?.district || 'Ludhiana';
      const clusterKey = `${district}-${tehsil}`.toLowerCase();

      if (!clusterMap[clusterKey]) {
        clusterMap[clusterKey] = {
          clusterId: clusterKey,
          tehsil,
          district,
          totalBookings: 0,
          totalAcreage: 0,
          projectedProviderEarnings: 0,
          centerCoordinates: b.parcelDetails?.location?.coordinates || [75.8573, 30.901],
          equipmentDemanded: {},
          urgencyScore: 'High',
        };
      }

      clusterMap[clusterKey].totalBookings += 1;
      clusterMap[clusterKey].totalAcreage += b.parcelDetails?.acreage || 1;
      clusterMap[clusterKey].projectedProviderEarnings += b.pricing?.providerPayoutAmount || 0;

      const equipType = b.serviceId?.machineryType || 'Tractor';
      clusterMap[clusterKey].equipmentDemanded[equipType] =
        (clusterMap[clusterKey].equipmentDemanded[equipType] || 0) + 1;
    });

    const clusters = Object.values(clusterMap);

    res.status(200).json({
      success: true,
      totalActiveDemandOrders: activeBookings.length,
      clusterCount: clusters.length,
      clusters,
    });
  } catch (error) {
    next(error);
  }
};

// Upload Provider KYC Document to S3
const uploadProviderKyc = async (req, res, next) => {
  try {
    const { type, title } = req.body;
    let fileUrl = req.body.fileUrl;
    let s3Key = null;

    if (req.file) {
      const s3Res = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype, 'kyc/providers');
      fileUrl = s3Res.proxyUrl;
      s3Key = s3Res.key;
    }

    if (!fileUrl) {
      return res.status(400).json({ success: false, message: 'Document file or fileUrl is required.' });
    }

    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Provider profile not found.' });
    }

    const existingIndex = profile.kycDocuments.findIndex((d) => d.type === type);
    if (existingIndex >= 0) {
      profile.kycDocuments[existingIndex] = {
        type,
        title: title || type,
        fileUrl,
        status: 'pending',
        uploadedAt: new Date(),
      };
    } else {
      profile.kycDocuments.push({
        type: type || 'rc_book',
        title: title || type,
        fileUrl,
        status: 'pending',
        uploadedAt: new Date(),
      });
    }

    profile.kycStatus = 'pending';
    await profile.save();

    emitToRole('admin', 'new_kyc_submission', {
      userRole: 'provider',
      userId: req.user._id,
      name: req.user.name,
      documentType: type,
      fileUrl,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'KYC document uploaded to S3 and submitted for review.',
      fileUrl,
      s3Key,
      kycDocuments: profile.kycDocuments,
      kycStatus: profile.kycStatus,
    });
  } catch (error) {
    next(error);
  }
};

// Submit full Provider Onboarding & KYC dossier for Admin review
const submitProviderOnboarding = async (req, res, next) => {
  try {
    const {
      fullName,
      emailAddress,
      businessName,
      serviceCategory,
      serviceTags,
      serviceDetails,
      baseLocation,
      coverageRadiusKm,
      tractorCount,
      harvesterCount,
      identityDocName,
      identityDocUrl,
      equipmentRcFileName,
      equipmentRcFileUrl,
      bankPassbookFileName,
      bankPassbookFileUrl,
    } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    if (fullName && fullName.trim()) user.name = fullName.trim();
    if (emailAddress && emailAddress.trim()) user.email = emailAddress.trim().toLowerCase();
    user.status = 'pending_verification';
    await user.save();

    // Prepare KYC documents
    const kycDocuments = [];
    if (identityDocUrl) {
      kycDocuments.push({
        type: 'identity_proof',
        title: identityDocName || 'Government Identity Proof',
        fileUrl: identityDocUrl,
        status: 'pending',
        uploadedAt: new Date(),
      });
    }
    if (equipmentRcFileUrl) {
      kycDocuments.push({
        type: 'machinery_rc',
        title: equipmentRcFileName || 'Equipment RC / Ownership',
        fileUrl: equipmentRcFileUrl,
        status: 'pending',
        uploadedAt: new Date(),
      });
    }
    if (bankPassbookFileUrl) {
      kycDocuments.push({
        type: 'bank_passbook',
        title: bankPassbookFileName || 'Bank Passbook / Cheque',
        fileUrl: bankPassbookFileUrl,
        status: 'pending',
        uploadedAt: new Date(),
      });
    }

    // Build machinery fleet items based on counts
    const machineryFleet = [];
    const tCount = Number(tractorCount) || 0;
    const hCount = Number(harvesterCount) || 0;
    for (let i = 1; i <= tCount; i++) {
      machineryFleet.push({
        machineryType: 'Tractor 4WD',
        model: 'Standard 4WD Farm Tractor',
        horsepower: 55,
        year: 2023,
        regPlateNumber: `PB-10-TR-${1000 + i}`,
        isAvailable: true,
      });
    }
    for (let i = 1; i <= hCount; i++) {
      machineryFleet.push({
        machineryType: 'Combine Harvester',
        model: 'Multi-Crop Combine Harvester',
        horsepower: 110,
        year: 2023,
        regPlateNumber: `PB-10-HV-${2000 + i}`,
        isAvailable: true,
      });
    }

    let profile = await ProviderProfile.findOne({ userId: user._id });
    if (!profile) {
      const randomSuffix = Math.floor(10000 + Math.random() * 90000);
      const contractorId = `PR-${randomSuffix}`;

      profile = new ProviderProfile({
        userId: user._id,
        contractorId,
        enterpriseName: businessName || `${user.name} Agri Services`,
        primaryCategory: serviceCategory || 'Harvesting & Mechanization',
        serviceTags: Array.isArray(serviceTags) ? serviceTags : [],
        coverageRadiusKm: Number(coverageRadiusKm) || 25,
        isOnline: false,
        kycStatus: 'pending',
        kycDocuments,
        machineryFleet,
      });
    } else {
      if (businessName) profile.enterpriseName = businessName;
      if (serviceCategory) profile.primaryCategory = serviceCategory;
      if (Array.isArray(serviceTags) && serviceTags.length > 0) profile.serviceTags = serviceTags;
      if (coverageRadiusKm) profile.coverageRadiusKm = Number(coverageRadiusKm);
      if (machineryFleet.length > 0) profile.machineryFleet = machineryFleet;
      profile.kycStatus = 'pending';
      if (kycDocuments.length > 0) {
        profile.kycDocuments = kycDocuments;
      }
    }

    await profile.save();

    // Broadcast live event to Admin Panel
    const io = req.app.get('io');
    if (io) {
      io.emit('new_kyc_submission', {
        userRole: 'provider',
        userId: user._id,
        name: user.name,
        phone: user.phone,
        enterpriseName: profile.enterpriseName,
        contractorId: profile.contractorId,
        documentsCount: profile.kycDocuments?.length || 0,
      });
      io.emit('provider_updated', { providerId: profile._id });
    }

    // Audit log
    await AuditLog.create({
      action: 'PROVIDER_ONBOARDING_SUBMITTED',
      targetType: 'provider',
      targetId: user._id,
      details: {
        enterpriseName: profile.enterpriseName,
        contractorId: profile.contractorId,
        documentsCount: profile.kycDocuments?.length || 0,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Provider profile and documents submitted for admin review.',
      profile,
    });
  } catch (error) {
    next(error);
  }
};

// Submit KYC documents after onboarding (when skipped during registration)
const submitKycDocumentsLater = async (req, res, next) => {
  try {
    const {
      identityDocName,
      identityDocUrl,
      equipmentRcFileName,
      equipmentRcFileUrl,
      bankPassbookFileName,
      bankPassbookFileUrl,
    } = req.body;

    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Provider profile not found.' });
    }

    if (!profile.kycDocuments) profile.kycDocuments = [];

    const addOrUpdateDoc = (type, title, fileUrl) => {
      if (!fileUrl) return;
      const idx = profile.kycDocuments.findIndex((d) => d.type === type);
      const docData = {
        type,
        title: title || type,
        fileUrl,
        status: 'pending',
        uploadedAt: new Date(),
      };
      if (idx >= 0) {
        profile.kycDocuments[idx] = docData;
      } else {
        profile.kycDocuments.push(docData);
      }
    };

    addOrUpdateDoc('identity_proof', identityDocName || 'Identity Document', identityDocUrl);
    addOrUpdateDoc('machinery_rc', equipmentRcFileName || 'Equipment RC', equipmentRcFileUrl);
    addOrUpdateDoc('bank_passbook', bankPassbookFileName || 'Bank Passbook', bankPassbookFileUrl);

    profile.kycStatus = 'pending';
    await profile.save();

    emitToRole('admin', 'new_kyc_submission', {
      userRole: 'provider',
      userId: req.user._id,
      name: req.user.name,
      documentsCount: profile.kycDocuments.length,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'KYC documents submitted successfully for verification.',
      kycDocuments: profile.kycDocuments,
      kycStatus: profile.kycStatus,
    });
  } catch (error) {
    next(error);
  }
};

// Save or update Provider Bank Details
const saveBankDetails = async (req, res, next) => {
  try {
    const { accountHolder, accountNumber, ifsc, bankName } = req.body;
    if (!accountNumber || !ifsc) {
      return res.status(400).json({ success: false, message: 'Account number and IFSC code are required.' });
    }

    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Provider profile not found.' });
    }

    profile.bankDetails = {
      accountHolder: accountHolder || req.user.name,
      accountNumber: accountNumber.trim(),
      ifsc: ifsc.trim().toUpperCase(),
      bankName: bankName || 'Bank',
      isVerified: false,
    };

    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Bank details saved successfully.',
      bankDetails: profile.bankDetails,
    });
  } catch (error) {
    next(error);
  }
};

// Create new Service by Provider (Gated by KYC Documents)
const createProviderService = async (req, res, next) => {
  try {
    const {
      title,
      category,
      description,
      machineryType,
      pricingModel,
      basePrice,
      minUnits,
      specifications,
      imageUrl,
    } = req.body;

    if (!title || !category || !basePrice || !machineryType) {
      return res.status(400).json({
        success: false,
        message: 'Title, category, machineryType, and basePrice are required.',
      });
    }

    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Provider profile not found.' });
    }

    // REQUIREMENT: Provider can only add services AFTER KYC documents are added
    const docs = profile.kycDocuments || [];
    if (docs.length === 0) {
      return res.status(403).json({
        success: false,
        code: 'KYC_DOCUMENTS_REQUIRED',
        message: 'Please upload your KYC documents (Aadhaar Card, Machinery RC, Bank Passbook) before adding services.',
      });
    }

    const service = await Service.create({
      title: title.trim(),
      category,
      description: description || `Professional ${title} service.`,
      machineryType: machineryType.trim(),
      pricingModel: pricingModel || 'per_acre',
      basePrice: Number(basePrice),
      minUnits: Number(minUnits) || 1,
      specifications: specifications || {
        horsepower: '50-60 HP',
        operatorIncluded: true,
        fuelIncluded: true,
      },
      providerId: req.user._id,
      createdByRole: 'provider',
      approvalStatus: 'pending', // Goes to admin for review
      isActive: false, // Visible to farmers only after admin approval
      providerName: profile.enterpriseName || req.user.name,
      operatingArea: `${profile.operatingRadiusKm || 25} km radius`,
      imageUrl: imageUrl || '',
    });

    const populatedService = await Service.findById(service._id).populate('category');

    emitToRole('admin', 'new_service_pending_approval', {
      serviceId: service._id,
      title: service.title,
      providerName: populatedService.providerName,
      basePrice: service.basePrice,
      createdAt: service.createdAt,
    });

    res.status(201).json({
      success: true,
      message: 'Service submitted successfully. It will be visible to farmers once reviewed and approved by admin.',
      service: populatedService,
    });
  } catch (error) {
    next(error);
  }
};

// Get provider's own services
const getMyServices = async (req, res, next) => {
  try {
    const services = await Service.find({ providerId: req.user._id })
      .populate('category')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: services.length,
      services,
    });
  } catch (error) {
    next(error);
  }
};

// Delete provider's own service
const deleteProviderService = async (req, res, next) => {
  try {
    const { id } = req.params;
    const service = await Service.findOne({ _id: id, providerId: req.user._id });
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found or unauthorized.' });
    }

    await Service.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Service deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProviderDashboard,
  toggleOnlineStatus,
  getFleet,
  addMachinery,
  getJobs,
  acceptJob,
  updateJobStatus,
  verifyStartOtp,
  completeJob,
  getEarnings,
  requestPayout,
  getReviews,
  getDemandHeatmap,
  uploadProviderKyc,
  submitProviderOnboarding,
  submitKycDocumentsLater,
  saveBankDetails,
  createProviderService,
  getMyServices,
  deleteProviderService,
};
