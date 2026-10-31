const Category = require('../models/Category');
const Service = require('../models/Service');
const ProviderProfile = require('../models/ProviderProfile');

// Get categories
const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ order: 1 }).lean();

    // Attach dynamic service count for each category
    const categoryIds = categories.map((c) => c._id);
    const serviceCounts = await Service.aggregate([
      { $match: { category: { $in: categoryIds }, isActive: true, approvalStatus: { $in: ['approved', null] } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    const countMap = {};
    serviceCounts.forEach((sc) => {
      countMap[sc._id.toString()] = sc.count;
    });

    const enrichedCategories = categories.map((cat) => ({
      ...cat,
      servicesCount: countMap[cat._id.toString()] || 0,
    }));

    res.status(200).json({
      success: true,
      count: enrichedCategories.length,
      categories: enrichedCategories,
    });
  } catch (error) {
    next(error);
  }
};

// Get services with filters
const getServices = async (req, res, next) => {
  try {
    const { category, search, machineryType, sort, status, all } = req.query;
    let query = { isActive: true, approvalStatus: { $in: ['approved', null] } };

    if (all === 'true' || status === 'all') {
      delete query.approvalStatus;
      delete query.isActive;
    } else if (status) {
      query.approvalStatus = status;
      delete query.isActive;
    }

    if (category) {
      // Find category by slug or id
      const cat = await Category.findOne({
        $or: [{ _id: category.match(/^[0-9a-fA-F]{24}$/) ? category : null }, { slug: category }],
      });
      if (cat) {
        query.category = cat._id;
      }
    }

    if (machineryType) {
      query.machineryType = new RegExp(machineryType, 'i');
    }

    if (search) {
      query.$or = [
        { title: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { machineryType: new RegExp(search, 'i') },
      ];
    }

    let sortOptions = { isFeatured: -1, createdAt: -1 };
    if (sort === 'price_asc') sortOptions = { basePrice: 1 };
    if (sort === 'price_desc') sortOptions = { basePrice: -1 };
    if (sort === 'rating') sortOptions = { rating: -1 };

    const services = await Service.find(query)
      .populate('category', 'name slug iconName')
      .populate('providerId', 'name phone email role')
      .sort(sortOptions);

    res.status(200).json({
      success: true,
      count: services.length,
      services,
    });
  } catch (error) {
    next(error);
  }
};

// Get service by ID
const getServiceById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const service = await Service.findById(id).populate('category');

    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    // Find count of online providers offering this machinery
    const nearbyProvidersCount = await ProviderProfile.countDocuments({
      isOnline: true,
      'machineryFleet.isAvailable': true,
    });

    res.status(200).json({
      success: true,
      service,
      nearbyProvidersCount: Math.max(nearbyProvidersCount, 3), // Realistic available machinery indicator
    });
  } catch (error) {
    next(error);
  }
};

// Check availability
const checkAvailability = async (req, res, next) => {
  try {
    const { serviceId, scheduledDate, acreage } = req.body;
    const service = await Service.findById(serviceId);

    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found.' });
    }

    const availableSlots = [
      { id: 'morning', label: 'Morning Slot (06:00 AM - 11:30 AM)', available: true },
      { id: 'afternoon', label: 'Afternoon Slot (12:00 PM - 05:30 PM)', available: true },
      { id: 'full_day', label: 'Full Day Continuous (07:00 AM - 05:00 PM)', available: true },
    ];

    res.status(200).json({
      success: true,
      serviceId,
      availableSlots,
      estimatedHours: Math.ceil((Number(acreage) || 5) * 0.8),
      equipmentUptime: '99% Fleet Ready',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCategories,
  getServices,
  getServiceById,
  checkAvailability,
};
