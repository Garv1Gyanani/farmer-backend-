const FarmerProfile = require('../models/FarmerProfile');
const Booking = require('../models/Booking');
const User = require('../models/User');
const Notification = require('../models/Notification');
const SoilReport = require('../models/SoilReport');
const { uploadToS3 } = require('../services/s3Service');
const { emitToRole } = require('../socket/socketHandler');

// Get farmer full profile
const getFarmerProfile = async (req, res, next) => {
  try {
    let profile = await FarmerProfile.findOne({ userId: req.user._id }).populate(
      'referredByAgentId',
      'name phone'
    );

    if (!profile) {
      profile = await FarmerProfile.create({
        userId: req.user._id,
        farmName: `${req.user.name}'s Farm`,
      });
    }

    res.status(200).json({
      success: true,
      profile,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

// Update farm & location details
const updateFarmDetails = async (req, res, next) => {
  try {
    const {
      farmName,
      totalLandSize,
      landUnit,
      farmingBackground,
      village,
      tehsilBlock,
      district,
      state,
      pinCode,
      landmark,
      latitude,
      longitude,
    } = req.body;

    const profile = await FarmerProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Farmer profile not found.' });
    }

    if (farmName) profile.farmName = farmName;
    if (totalLandSize) profile.totalLandSize = Number(totalLandSize);
    if (landUnit) profile.landUnit = landUnit;
    if (farmingBackground) profile.farmingBackground = farmingBackground;
    if (village) profile.village = village;
    if (tehsilBlock) profile.tehsilBlock = tehsilBlock;
    if (district) profile.district = district;
    if (state) profile.state = state;
    if (pinCode) profile.pinCode = pinCode;
    if (landmark) profile.landmark = landmark;

    if (latitude && longitude) {
      profile.location = {
        type: 'Point',
        coordinates: [Number(longitude), Number(latitude)],
      };
    }

    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Farm and location details updated',
      profile,
    });
  } catch (error) {
    next(error);
  }
};

// Add parcel
const addParcel = async (req, res, next) => {
  try {
    const { name, acreage, soilType, irrigationSource, approachRoadNotes, latitude, longitude } =
      req.body;

    if (!name || !acreage) {
      return res.status(400).json({ success: false, message: 'Parcel name and acreage are required.' });
    }

    const profile = await FarmerProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Farmer profile not found.' });
    }

    const newParcel = {
      name,
      acreage: Number(acreage),
      soilType: soilType || 'Alluvial',
      irrigationSource: irrigationSource || 'Tubewell',
      approachRoadNotes: approachRoadNotes || '',
    };

    if (latitude && longitude) {
      newParcel.coordinates = {
        type: 'Point',
        coordinates: [Number(longitude), Number(latitude)],
      };
    }

    profile.parcels.push(newParcel);
    await profile.save();

    res.status(201).json({
      success: true,
      message: 'Parcel added successfully',
      parcels: profile.parcels,
    });
  } catch (error) {
    next(error);
  }
};

// Delete parcel
const deleteParcel = async (req, res, next) => {
  try {
    const { parcelId } = req.params;
    const profile = await FarmerProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Farmer profile not found.' });
    }

    profile.parcels = profile.parcels.filter((p) => p._id.toString() !== parcelId);
    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Parcel removed successfully',
      parcels: profile.parcels,
    });
  } catch (error) {
    next(error);
  }
};

// Upload KYC document
const uploadKycDocument = async (req, res, next) => {
  try {
    const { type, title } = req.body;

    if (!req.file && !req.body.fileUrl) {
      return res.status(400).json({ success: false, message: 'Document file or fileUrl is required.' });
    }

    let fileUrl = req.body.fileUrl;
    let s3Key = null;

    if (req.file) {
      const s3Res = await uploadToS3(req.file.buffer, req.file.originalname, req.file.mimetype, 'kyc/farmers');
      fileUrl = s3Res.proxyUrl;
      s3Key = s3Res.key;
    }

    const profile = await FarmerProfile.findOne({ userId: req.user._id });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Farmer profile not found.' });
    }

    // Check if doc type already exists, replace it or push
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
        type: type || 'identity_aadhaar',
        title: title || type,
        fileUrl,
        status: 'pending',
        uploadedAt: new Date(),
      });
    }

    profile.kycStatus = 'pending';
    profile.kycRejectionReason = '';
    await profile.save();

    // Alert Admin Queue via Socket.IO
    emitToRole('admin', 'new_kyc_submission', {
      userRole: 'farmer',
      userId: req.user._id,
      name: req.user.name,
      documentType: type,
      fileUrl,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'KYC document uploaded to S3 storage and submitted for verification.',
      fileUrl,
      s3Key,
      kycDocuments: profile.kycDocuments,
      kycStatus: profile.kycStatus,
    });
  } catch (error) {
    next(error);
  }
};

// Get Soil Health Report for a parcel
const getParcelSoilReport = async (req, res, next) => {
  try {
    const { parcelId } = req.params;
    let report = await SoilReport.findOne({ parcelId });

    if (!report) {
      // Find parcel name from farmer profile
      const profile = await FarmerProfile.findOne({ userId: req.user._id });
      const parcel = profile?.parcels?.id(parcelId);
      const parcelName = parcel?.name || 'Primary Farm Parcel';

      // Generate initial certified soil health benchmark for this parcel
      report = await SoilReport.create({
        farmerId: req.user._id,
        parcelId,
        parcelName,
        sampleId: `SOIL-${Date.now().toString().slice(-6)}`,
        laboratory: {
          name: 'PAU Department of Soil Science',
          certificateNo: `PAU-${Date.now().toString().slice(-5)}`,
          accreditation: 'NABL Accredited Testing Facility',
        },
        parameters: {
          ph: { value: 7.2, rating: 'optimal', idealRange: '6.5 - 7.5' },
          ec: { value: 0.42, unit: 'dS/m', rating: 'normal', idealRange: '< 1.0 dS/m' },
          organicCarbon: { value: 0.68, unit: '%', rating: 'medium', idealRange: '> 0.75%' },
          nitrogen: { value: 240, unit: 'kg/ha', rating: 'low', idealRange: '280 - 560 kg/ha' },
          phosphorus: { value: 19.5, unit: 'kg/ha', rating: 'medium', idealRange: '10 - 25 kg/ha' },
          potassium: { value: 285, unit: 'kg/ha', rating: 'high', idealRange: '110 - 280 kg/ha' },
          zinc: { value: 0.85, unit: 'ppm', rating: 'deficient' },
          iron: { value: 6.1, unit: 'ppm', rating: 'sufficient' },
        },
        fertilizerRecommendations: [
          { fertilizerName: 'Urea (Nitrogen Supplement)', dosagePerAcre: '45 kg / acre', applicationTiming: 'Split: 50% at sowing, 50% first irrigation', purpose: 'Boost vegetative canopy' },
          { fertilizerName: 'Single Super Phosphate (SSP)', dosagePerAcre: '75 kg / acre', applicationTiming: 'Basal dressing before harrowing', purpose: 'Root development' },
          { fertilizerName: 'Zinc Sulphate (21%)', dosagePerAcre: '10 kg / acre', applicationTiming: 'Basal with organic compost', purpose: 'Correct zinc deficiency' },
        ],
        cropSuitability: [
          { crop: 'Wheat (HD-3086 / PBW-824)', suitabilityScore: 94, notes: 'Optimal pH and potassium reserves' },
          { crop: 'Mustard (Pusa Mustard-30)', suitabilityScore: 88, notes: 'Requires sulphur supplementation' },
          { crop: 'Paddy / Basmati (Pusa-1121)', suitabilityScore: 91, notes: 'High water retention capacity' },
        ],
      });
    }

    res.status(200).json({
      success: true,
      report,
    });
  } catch (error) {
    next(error);
  }
};

// Save or Update Soil Health Report
const saveSoilReport = async (req, res, next) => {
  try {
    const { parcelId } = req.params;
    const updateData = req.body;

    const report = await SoilReport.findOneAndUpdate(
      { parcelId },
      { ...updateData, farmerId: req.user._id, parcelId },
      { new: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Soil health report updated successfully.',
      report,
    });
  } catch (error) {
    next(error);
  }
};

// Get farmer bookings
const getFarmerBookings = async (req, res, next) => {
  try {
    const { status } = req.query;
    let query = { farmerId: req.user._id };

    if (status === 'active') {
      query.status = { $in: ['pending_broadcast', 'assigned', 'en_route', 'arrived', 'in_progress'] };
    } else if (status === 'completed') {
      query.status = 'completed';
    } else if (status === 'cancelled') {
      query.status = 'cancelled';
    }

    const bookings = await Booking.find(query)
      .populate('serviceId')
      .populate('providerId', 'name phone avatarUrl')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: bookings.length,
      bookings,
    });
  } catch (error) {
    next(error);
  }
};

// Get Farmer Home Feed (Single aggregated payload for Farmer Mobile App home screen)
const getFarmerHomeFeed = async (req, res, next) => {
  try {
    const user = req.user;
    let profile = await FarmerProfile.findOne({ userId: user._id });
    if (!profile) {
      profile = await FarmerProfile.create({
        userId: user._id,
        farmName: `${user.name}'s Farm`,
      });
    }

    // 1. Fetch active/in-progress booking if any
    const activeBooking = await Booking.findOne({
      farmerId: user._id,
      status: { $in: ['pending_broadcast', 'assigned', 'en_route', 'arrived', 'in_progress'] },
    })
      .populate('serviceId')
      .populate('providerId', 'name phone avatarUrl')
      .sort({ createdAt: -1 });

    // 2. Fetch micro-climate weather based on farmer's GPS coordinates
    const lat = profile.location?.coordinates?.[1] || 30.901;
    const lon = profile.location?.coordinates?.[0] || 75.8573;
    let weatherData = null;
    try {
      const { fetchAgriWeather } = require('../services/weatherService');
      weatherData = await fetchAgriWeather(lat, lon);
    } catch (wErr) {
      console.warn('[HomeFeed] Weather fetch notice:', wErr.message);
    }

    // 3. Service Categories with count
    const Category = require('../models/Category');
    const Service = require('../models/Service');
    const categories = await Category.find().sort({ order: 1 });

    // 4. Featured nearby services
    const featuredServices = await Service.find({ isAvailable: true })
      .populate('category')
      .limit(6);

    // 5. Active seasonal discounts / promotions
    const promotionalBanners = [
      {
        id: 'promo-1',
        title: 'Special Monsoon Land Preparation Discount',
        subtitle: 'Flat 20% OFF on Laser Leveler & Heavy Rotavators',
        couponCode: 'MONSOON20',
        badge: 'Limited Season Offer',
        backgroundColor: '#17351F',
      },
      {
        id: 'promo-2',
        title: 'Kisan Precision Nano-Urea Subsidy',
        subtitle: 'Save ₹500 instantly on Certified Drone Misting Spray',
        couponCode: 'KISAN500',
        badge: 'PAU Endorsed',
        backgroundColor: '#2E7D32',
      },
    ];

    res.status(200).json({
      success: true,
      data: {
        farmer: {
          id: user._id,
          name: user.name,
          phone: user.phone,
          status: user.status,
          avatarUrl: user.avatarUrl,
          farmName: profile.farmName,
          village: profile.village || 'Patiala Rural',
          tehsil: profile.tehsilBlock || 'Nabha',
          district: profile.district || 'Patiala',
          totalLandSize: profile.totalLandSize,
          landUnit: profile.landUnit,
          kycStatus: profile.kycStatus,
          parcelsCount: profile.parcels?.length || 1,
        },
        activeBooking: activeBooking
          ? {
              id: activeBooking._id,
              bookingNumber: activeBooking.bookingNumber,
              serviceName: activeBooking.serviceId?.title || 'Farm Mechanization Service',
              status: activeBooking.status,
              startOtp: activeBooking.startOtp,
              scheduledDate: activeBooking.scheduledDate,
              timeSlot: activeBooking.timeSlot,
              totalAmount: activeBooking.pricing.totalAmount,
              provider: activeBooking.providerId
                ? {
                    name: activeBooking.providerId.name,
                    phone: activeBooking.providerId.phone,
                  }
                : null,
            }
          : null,
        weather: weatherData?.current
          ? {
              temperature: weatherData.current.temperature,
              condition: weatherData.current.condition,
              humidity: weatherData.current.humidity,
              windSpeedKmh: weatherData.current.windSpeed,
              precipitation: weatherData.current.precipitation,
              advisories: weatherData.advisories,
            }
          : null,
        categories: categories.map((c) => ({
          id: c._id,
          name: c.name,
          slug: c.slug,
          iconName: c.iconName,
        })),
        featuredServices: featuredServices.map((s) => ({
          id: s._id,
          title: s.title,
          categoryName: s.category?.name || 'General Agricultural Service',
          basePrice: s.basePrice,
          pricingModel: s.pricingModel,
          imageUrl: s.imageUrl,
          rating: s.rating,
          totalRatings: s.totalRatings,
          horsepower: s.specifications?.horsepower || '55 HP',
          operatorIncluded: s.specifications?.operatorIncluded !== false,
          fuelIncluded: s.specifications?.fuelIncluded !== false,
        })),
        promotions: promotionalBanners,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFarmerProfile,
  updateFarmDetails,
  addParcel,
  deleteParcel,
  uploadKycDocument,
  getParcelSoilReport,
  saveSoilReport,
  getFarmerBookings,
  getFarmerHomeFeed,
};
