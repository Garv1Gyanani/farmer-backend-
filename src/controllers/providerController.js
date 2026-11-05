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
const { sendNotificationToUser } = require('../services/fcmService');
const { STATUS, transitionBooking } = require('../services/bookingStateMachine');
const {
  EVENTS,
  notifyUser,
  notifyAdmins,
  broadcastBookingUpdate,
} = require('../services/notificationService');
const { settleBooking } = require('../services/bookingSettlement');

// Provider Dashboard
const getProviderDashboard = async (req, res, next) => {
  try {
    const profile = await ProviderProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Provider profile not found.' });
    }

    const wallet = await Wallet.findOne({ userId: req.user._id });

    // Urgent requests: bookings waiting for dispatch (excluding those this provider declined)
    const urgentRequests = await Booking.find({
      status: STATUS.PENDING,
      'rejections.providerId': { $ne: req.user._id },
    })
      .populate('serviceId', 'title machineryType pricingModel basePrice')
      .populate('farmerId', 'name phone')
      .sort({ createdAt: -1 })
      .limit(5);

    // Active ongoing jobs (assigned, in_progress, completion_pending)
    const activeJobs = await Booking.find({
      providerId: req.user._id,
      status: { $in: [STATUS.ACCEPTED, STATUS.IN_PROGRESS, STATUS.COMPLETION_PENDING] },
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
      query = {
        status: STATUS.PENDING,
        'rejections.providerId': { $ne: req.user._id },
      };
    } else if (tab === 'ongoing') {
      query = {
        providerId: req.user._id,
        status: { $in: [STATUS.ACCEPTED, STATUS.IN_PROGRESS, STATUS.COMPLETION_PENDING] },
      };
    } else if (tab === 'completed') {
      query = {
        providerId: req.user._id,
        status: STATUS.COMPLETED,
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

    // Idempotency check: if this booking is already accepted by the calling provider, return 200 smoothly
    const existing = await Booking.findById(bookingId);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }
    if (existing.status === STATUS.ACCEPTED && existing.providerId && existing.providerId.toString() === req.user._id.toString()) {
      await existing.populate('serviceId');
      await existing.populate('farmerId', 'name phone avatarUrl');
      return res.status(200).json({
        success: true,
        message: 'Dispatch already accepted. Prepare equipment and proceed to field.',
        booking: existing,
      });
    }

    // Atomically transition from PENDING -> ACCEPTED with concurrency check
    const booking = await transitionBooking({
      bookingId,
      to: STATUS.ACCEPTED,
      actor: req.user,
      note: `Dispatch accepted by provider ${req.user.name}`,
      from: [STATUS.PENDING],
      set: {
        providerId: req.user._id,
        acceptedBy: req.user._id,
        acceptedAt: new Date(),
      },
    });

    await booking.populate('serviceId');
    await booking.populate('farmerId', 'name phone avatarUrl');

    // Notify farmer via persistent notification, socket, and FCM (includes Start OTP)
    const otpNotice = booking.startOtp ? ` Your Job Start Code is ${booking.startOtp}.` : '';
    await notifyUser({
      userId: booking.farmerId?._id || booking.farmerId,
      bookingId: booking._id,
      eventType: EVENTS.BOOKING_ACCEPTED,
      title: booking.startOtp ? `🚜 Provider Confirmed! Start OTP: #${booking.startOtp}` : '🚜 Provider Confirmed!',
      message: `${req.user.name} has accepted your booking #${booking.bookingNumber}.${otpNotice} Please share this 4-digit code with the operator upon arrival to begin field work.`,
      data: {
        bookingId: String(booking._id),
        status: STATUS.ACCEPTED,
        startOtp: booking.startOtp ? String(booking.startOtp) : '',
      },
    });

    // Notify Admins
    await notifyAdmins({
      bookingId: booking._id,
      eventType: EVENTS.BOOKING_ACCEPTED,
      title: 'Booking Accepted',
      message: `Provider ${req.user.name} accepted booking #${booking.bookingNumber}.`,
      data: {
        bookingId: String(booking._id),
        providerId: String(req.user._id),
      },
    });

    // Broadcast live state update to all dashboards (admin, provider, farmer)
    broadcastBookingUpdate(booking, {
      providerName: req.user.name,
    });

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

// Reject / Decline Job
const rejectJob = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { reason = 'Not available at requested time' } = req.body;

    const currentBooking = await Booking.findById(bookingId);
    if (!currentBooking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    const rejectionEntry = {
      providerId: req.user._id,
      reason,
      timestamp: new Date(),
    };

    let updatedBooking;
    // If specifically assigned to this provider, transition to rejected for admin reallocation
    if (currentBooking.providerId && String(currentBooking.providerId) === String(req.user._id)) {
      updatedBooking = await transitionBooking({
        bookingId,
        to: STATUS.REJECTED,
        actor: req.user,
        note: `Job declined by assigned provider ${req.user.name}: ${reason}`,
        push: { rejections: rejectionEntry },
        set: { providerId: null },
      });
    } else {
      // Record rejection in broadcast pool so this provider will no longer see it
      updatedBooking = await Booking.findByIdAndUpdate(
        bookingId,
        {
          $push: { rejections: rejectionEntry },
        },
        { new: true }
      );
    }

    // Notify Admins
    await notifyAdmins({
      bookingId: updatedBooking._id,
      eventType: EVENTS.BOOKING_REJECTED,
      title: 'Provider Declined Job',
      message: `Provider ${req.user.name} declined booking #${updatedBooking.bookingNumber}. Reason: ${reason}`,
      data: {
        bookingId: String(updatedBooking._id),
        providerId: String(req.user._id),
        reason,
      },
    });

    broadcastBookingUpdate(updatedBooking, {
      rejectedBy: req.user.name,
      reason,
    });

    res.status(200).json({
      success: true,
      message: 'Job request declined.',
      booking: updatedBooking,
    });
  } catch (error) {
    next(error);
  }
};

// Update job status to in_progress (start field work)
const updateJobStatus = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { status, note } = req.body;

    if (status && status !== STATUS.IN_PROGRESS) {
      return res.status(400).json({
        success: false,
        message: `Invalid status "${status}". Allowed status transition is "in_progress".`,
      });
    }

    const booking = await transitionBooking({
      bookingId,
      to: STATUS.IN_PROGRESS,
      actor: req.user,
      note: note || 'Field operation started by provider',
      filter: { providerId: req.user._id },
      set: { startedAt: new Date() },
    });

    await notifyUser({
      userId: booking.farmerId,
      bookingId: booking._id,
      eventType: EVENTS.WORK_STARTED,
      title: '⚙️ Work Started',
      message: `Field work has started for booking #${booking.bookingNumber}.`,
      data: { bookingId: String(booking._id), status: STATUS.IN_PROGRESS },
    });

    broadcastBookingUpdate(booking);

    res.status(200).json({
      success: true,
      message: 'Job status updated to in_progress',
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

    const bookingDoc = await Booking.findOne({ _id: bookingId, providerId: req.user._id });
    if (!bookingDoc) {
      return res.status(404).json({ success: false, message: 'Booking not found or not assigned to you.' });
    }

    const cleanOtp = String(otp || '').trim();
    if (!cleanOtp) {
      return res.status(400).json({ success: false, message: '4-digit Start OTP is required.' });
    }

    if (bookingDoc.startOtp && bookingDoc.startOtp !== cleanOtp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Start OTP! Please request the correct 4-digit code shown on the farmer app.',
      });
    }

    const booking = await transitionBooking({
      bookingId,
      to: STATUS.IN_PROGRESS,
      actor: req.user,
      note: 'Field operation started via OTP verification',
      filter: { providerId: req.user._id },
      set: { startedAt: new Date() },
    });

    await notifyUser({
      userId: booking.farmerId,
      bookingId: booking._id,
      eventType: EVENTS.WORK_STARTED,
      title: '⚙️ Work Commenced!',
      message: `Field operation has started for Booking #${booking.bookingNumber}.`,
      data: { bookingId: String(booking._id), status: STATUS.IN_PROGRESS },
    });

    broadcastBookingUpdate(booking);

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully! Work has officially started.',
      booking,
    });
  } catch (error) {
    next(error);
  }
};

// Complete Job - Marks completion_pending and generates confirmation OTP
const completeJob = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { acreageWorked, operatorNotes, fieldPhotoUrl } = req.body;

    const existingBooking = await Booking.findOne({ _id: bookingId, providerId: req.user._id });
    if (!existingBooking) {
      return res.status(404).json({ success: false, message: 'Booking not found or not assigned to you.' });
    }

    if (existingBooking.status === STATUS.COMPLETED) {
      return res.status(400).json({ success: false, message: 'Booking has already been completed.' });
    }

    // Generate 4-digit confirmation OTP for farmer
    const completionOtp = Math.floor(1000 + Math.random() * 9000).toString();

    const booking = await transitionBooking({
      bookingId,
      to: STATUS.COMPLETION_PENDING,
      actor: req.user,
      note: `Field operation completed by provider. Awaiting farmer OTP confirmation.`,
      filter: { providerId: req.user._id },
      set: {
        completionOtp,
        completionRequestedAt: new Date(),
        'completionSignoff.acreageWorked': Number(acreageWorked) || existingBooking.parcelDetails?.acreage || 1,
        'completionSignoff.operatorNotes': operatorNotes || '',
        'completionSignoff.fieldPhotoUrl': fieldPhotoUrl || '',
      },
    });

    // Notify farmer with the completion OTP
    await notifyUser({
      userId: booking.farmerId,
      bookingId: booking._id,
      eventType: EVENTS.WORK_COMPLETED,
      title: '🌾 Work Completed - Confirmation Needed',
      message: `Provider completed field work for Booking #${booking.bookingNumber}. Your completion confirmation OTP is: ${completionOtp}`,
      data: {
        bookingId: String(booking._id),
        status: STATUS.COMPLETION_PENDING,
        completionOtp,
      },
    });

    // Notify Admin
    await notifyAdmins({
      bookingId: booking._id,
      eventType: EVENTS.WORK_COMPLETED,
      title: 'Work Completed — Awaiting Farmer OTP',
      message: `Provider ${req.user.name} finished work for #${booking.bookingNumber}. Waiting for farmer OTP verification.`,
      data: { bookingId: String(booking._id) },
    });

    broadcastBookingUpdate(booking, { completionOtp });

    res.status(200).json({
      success: true,
      message: 'Work completion recorded! Awaiting farmer confirmation OTP.',
      booking,
      completionOtp,
    });
  } catch (error) {
    next(error);
  }
};

// Verify completion OTP given by farmer to provider
const verifyCompletionOtp = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const { otp } = req.body;

    if (!otp) {
      return res.status(400).json({ success: false, message: '4-digit completion OTP is required.' });
    }

    const bookingDoc = await Booking.findOne({ _id: bookingId, providerId: req.user._id }).select('+completionOtp');
    if (!bookingDoc) {
      return res.status(404).json({ success: false, message: 'Booking not found or not assigned to you.' });
    }

    if (bookingDoc.status === STATUS.COMPLETED) {
      return res.status(400).json({ success: false, message: 'Booking has already been completed.' });
    }

    if (bookingDoc.completionOtp && bookingDoc.completionOtp !== String(otp).trim()) {
      return res.status(400).json({ success: false, message: 'Invalid completion OTP! Please check with the farmer.' });
    }

    const booking = await transitionBooking({
      bookingId,
      to: STATUS.COMPLETED,
      actor: req.user,
      note: 'Field operation confirmed and verified via completion OTP.',
      filter: { providerId: req.user._id },
      set: {
        'completionSignoff.completedAt': new Date(),
      },
    });

    // Settle payouts atomically
    await settleBooking(booking._id);

    // Notify farmer and admin
    await notifyUser({
      userId: booking.farmerId,
      bookingId: booking._id,
      eventType: EVENTS.COMPLETION_CONFIRMED,
      title: '🎉 Booking Completed & Verified!',
      message: `Your booking #${booking.bookingNumber} is complete and settled. Thank you for using ProFarmer!`,
      data: { bookingId: String(booking._id), status: STATUS.COMPLETED },
    });

    await notifyAdmins({
      bookingId: booking._id,
      eventType: EVENTS.COMPLETION_CONFIRMED,
      title: 'Booking Completed & Settled',
      message: `Booking #${booking.bookingNumber} completed via OTP and settled.`,
      data: { bookingId: String(booking._id) },
    });

    broadcastBookingUpdate(booking);

    res.status(200).json({
      success: true,
      message: 'Completion OTP verified successfully! Payout has been credited to your wallet.',
      booking,
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
      description: description ? description.trim() : '',
      machineryType: machineryType.trim(),
      pricingModel: pricingModel || 'per_acre',
      basePrice: Number(basePrice),
      minUnits: Number(minUnits) || 1,
      specifications: {
        horsepower: specifications?.horsepower || '',
        implementWidth: specifications?.implementWidth || '',
        fuelIncluded: specifications?.fuelIncluded !== false,
        operatorIncluded: specifications?.operatorIncluded !== false,
        turnaroundTime: specifications?.turnaroundTime || '',
      },
      providerId: req.user._id,
      createdByRole: 'provider',
      approvalStatus: 'pending', // Goes to admin for review
      isActive: false, // Visible to farmers only after admin approval
      providerName: profile.enterpriseName || req.user.name,
      operatingArea: profile.coverageRadiusKm ? `${profile.coverageRadiusKm} km radius` : '',
      imageUrl: imageUrl || '',
      rating: 0,
      reviewsCount: 0,
      badgeTag: '',
      nextSlot: '',
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
  rejectJob,
  updateJobStatus,
  verifyStartOtp,
  completeJob,
  verifyCompletionOtp,
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
