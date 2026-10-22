const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const User = require('../models/User');
const FarmerProfile = require('../models/FarmerProfile');
const AgentProfile = require('../models/AgentProfile');
const ProviderProfile = require('../models/ProviderProfile');
const Category = require('../models/Category');
const Service = require('../models/Service');
const Booking = require('../models/Booking');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const PayoutRequest = require('../models/PayoutRequest');
const CommissionRecord = require('../models/CommissionRecord');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');

const seedData = async () => {
  try {
    console.log('[Seeder] Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[Seeder] Connected successfully!');

    // Clear existing collections
    console.log('[Seeder] Clearing old records...');
    await Promise.all([
      User.deleteMany(),
      FarmerProfile.deleteMany(),
      AgentProfile.deleteMany(),
      ProviderProfile.deleteMany(),
      Category.deleteMany(),
      Service.deleteMany(),
      Booking.deleteMany(),
      Wallet.deleteMany(),
      Transaction.deleteMany(),
      PayoutRequest.deleteMany(),
      CommissionRecord.deleteMany(),
      Review.deleteMany(),
      Notification.deleteMany(),
      AuditLog.deleteMany(),
    ]);

    // 1. Create Admin
    console.log('[Seeder] Creating Admin account...');
    const adminUser = await User.create({
      name: 'ProFarmer Head Admin',
      phone: '+919876500000',
      email: 'admin@profarmer.com',
      password: 'Admin@123456',
      role: 'admin',
      status: 'active',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    });

    await Wallet.create({
      userId: adminUser._id,
      userRole: 'admin',
      balance: 145000,
      totalEarned: 145000,
    });

    // 2. Create Categories
    console.log('[Seeder] Creating Service Categories...');
    const categoriesData = [
      {
        name: 'Land Preparation & Tillage',
        slug: 'land-preparation',
        description: 'Tractor laser leveling, disc harrowing, deep subsoiling and heavy rotavator operations.',
        iconName: 'agriculture',
        order: 1,
      },
      {
        name: 'Sowing & Precision Seeding',
        slug: 'sowing-seeding',
        description: 'Happy seeders, super seeders, multi-crop seed cum fertilizer drills for maximum germination.',
        iconName: 'grass',
        order: 2,
      },
      {
        name: 'Crop Protection & Drone Spraying',
        slug: 'crop-protection',
        description: 'DGCA certified agri-drone aerial pesticide and nano-urea spraying with centimetre GPS precision.',
        iconName: 'flutter_dash',
        order: 3,
      },
      {
        name: 'Harvesting & Threshing',
        slug: 'harvesting',
        description: 'Multi-crop self-propelled combine harvesters with SMS (Straw Management System) and straw reapers.',
        iconName: 'eco',
        order: 4,
      },
      {
        name: 'Post-Harvest & Transport',
        slug: 'post-harvest',
        description: 'Trolley transport to mandis, crop moisture grading, grain storage loaders.',
        iconName: 'local_shipping',
        order: 5,
      },
      {
        name: 'Soil Testing & Agronomy Advisory',
        slug: 'soil-testing',
        description: 'Comprehensive NPK + Micronutrient soil health testing with digital advisor reports.',
        iconName: 'science',
        order: 6,
      },
    ];

    const categories = await Category.insertMany(categoriesData);
    const catMap = new Map();
    categories.forEach((c) => catMap.set(c.slug, c._id));

    // 3. Create Services
    console.log('[Seeder] Creating Catalog Services...');
    const servicesData = [
      {
        title: 'Laser Land Leveling (Dual Transmitter)',
        category: catMap.get('land-preparation'),
        description: 'Dual-axis laser transmitter with hydraulic bucket scraper. Saves up to 25% irrigation water and improves crop yields by 15%.',
        machineryType: 'Laser Land Leveler',
        pricingModel: 'per_acre',
        basePrice: 950,
        minUnits: 2,
        specifications: {
          horsepower: '55-65 HP 4WD',
          implementWidth: '8 Feet Hydraulic Scraper',
          fuelIncluded: true,
          operatorIncluded: true,
          turnaroundTime: '1.5 hrs / acre',
        },
        rating: 4.9,
        reviewsCount: 88,
        isFeatured: true,
        imageUrl: 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Heavy Duty Rotavator Tillage',
        category: catMap.get('land-preparation'),
        description: 'Multi-speed gearbox rotavator for fine seedbed preparation in single pass. Ideal for wheat and vegetable sowing.',
        machineryType: 'Rotavator',
        pricingModel: 'per_acre',
        basePrice: 1200,
        minUnits: 1,
        specifications: {
          horsepower: '50 HP',
          implementWidth: '7 Feet Boron Steel Blades',
          fuelIncluded: true,
          operatorIncluded: true,
          turnaroundTime: '1 hr / acre',
        },
        rating: 4.8,
        reviewsCount: 114,
        isFeatured: false,
        imageUrl: 'https://images.unsplash.com/photo-1594771804886-a933bb2d609b?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Agri-Drone Precision Nano-Sprayer',
        category: catMap.get('crop-protection'),
        description: 'Hexacopter autonomous drone with dual radar obstacle avoidance. Fast, uniform crop canopy penetration without soil compaction.',
        machineryType: 'Agri-Drone Sprayer',
        pricingModel: 'per_acre',
        basePrice: 450,
        minUnits: 3,
        specifications: {
          horsepower: 'Electric (Dual 28000mAh Battery)',
          implementWidth: '6.5 Metre Spray Swath',
          fuelIncluded: true,
          operatorIncluded: true,
          turnaroundTime: '10 mins / acre',
        },
        rating: 4.95,
        reviewsCount: 165,
        isFeatured: true,
        imageUrl: 'https://images.unsplash.com/photo-1527977966376-1c8408f9f108?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Super Seeder Direct Paddy-Wheat Drill',
        category: catMap.get('sowing-seeding'),
        description: 'Simultaneous residue mulching and precision wheat sowing in standing paddy stubble. Eliminates stubble burning completely.',
        machineryType: 'Precision Seed Drill',
        pricingModel: 'per_acre',
        basePrice: 1600,
        minUnits: 2,
        specifications: {
          horsepower: '55-60 HP',
          implementWidth: '11 Row Tynes',
          fuelIncluded: true,
          operatorIncluded: true,
          turnaroundTime: '1.2 hrs / acre',
        },
        rating: 4.85,
        reviewsCount: 72,
        isFeatured: true,
        imageUrl: 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Combine Harvester (Paddy & Grain Master)',
        category: catMap.get('harvesting'),
        description: 'Track-type combine harvester with Straw Management System (SMS) cutter bar. Operates smoothly even in wet and lodged field conditions.',
        machineryType: 'Combine Harvester',
        pricingModel: 'per_acre',
        basePrice: 2400,
        minUnits: 2,
        specifications: {
          horsepower: '101 HP Turbo Diesel',
          implementWidth: '14 Feet Cutter Bar',
          fuelIncluded: true,
          operatorIncluded: true,
          turnaroundTime: '45 mins / acre',
        },
        rating: 4.92,
        reviewsCount: 142,
        isFeatured: true,
        imageUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'High-Density Straw Baler',
        category: catMap.get('post-harvest'),
        description: 'Automatic twine knotter straw baler. Compresses loose stubble into compact rectangular bales for easy transport to bio-plants.',
        machineryType: 'Baler / Straw Reaper',
        pricingModel: 'per_acre',
        basePrice: 850,
        minUnits: 3,
        specifications: {
          horsepower: '45-50 HP',
          implementWidth: '5.5 Feet Pick-up Reel',
          fuelIncluded: true,
          operatorIncluded: true,
          turnaroundTime: '40 mins / acre',
        },
        rating: 4.75,
        reviewsCount: 54,
        isFeatured: false,
        imageUrl: 'https://images.unsplash.com/photo-1560493676-04071c5f467b?auto=format&fit=crop&w=800&q=80',
      },
      {
        title: 'Comprehensive NPK Soil Lab Health Analysis',
        category: catMap.get('soil-testing'),
        description: 'Certified soil core sampling, organic carbon, pH, electrical conductivity, macro & micronutrient profiling with localized fertilizer prescription.',
        machineryType: 'Soil Testing Lab Kit',
        pricingModel: 'per_acre',
        basePrice: 600,
        minUnits: 1,
        specifications: {
          horsepower: 'N/A - Digital Ag Lab',
          implementWidth: 'GPS Parcel Core Grids',
          fuelIncluded: true,
          operatorIncluded: true,
          turnaroundTime: '48 hrs digital report',
        },
        rating: 4.9,
        reviewsCount: 96,
        isFeatured: false,
        imageUrl: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?auto=format&fit=crop&w=800&q=80',
      },
    ];

    const services = await Service.insertMany(servicesData);

    // 4. Create Field Agents
    console.log('[Seeder] Creating Field Agents...');
    const agentUsersData = [
      {
        name: 'Jaspreet Singh',
        phone: '+919876543210',
        email: 'agent1@profarmer.com',
        agentCode: 'AG-9821',
        clusters: [
          { villageName: 'Nabha Rural', tehsil: 'Nabha', district: 'Patiala', farmerCount: 28, isVisited: true, lastVisitedAt: new Date(Date.now() - 86400000) },
          { villageName: 'Samrala Hub', tehsil: 'Samrala', district: 'Ludhiana', farmerCount: 22, isVisited: true, lastVisitedAt: new Date(Date.now() - 172800000) },
          { villageName: 'Khanna Mandi', tehsil: 'Khanna', district: 'Ludhiana', farmerCount: 16, isVisited: false },
        ],
        availableComm: 14200,
        pendingComm: 4500,
        vestedComm: 9700,
        totalEarned: 38400,
      },
      {
        name: 'Gurinder Dhillon',
        phone: '+919876543211',
        email: 'agent2@profarmer.com',
        agentCode: 'AG-4512',
        clusters: [
          { villageName: 'Raikot North', tehsil: 'Raikot', district: 'Ludhiana', farmerCount: 19, isVisited: true, lastVisitedAt: new Date() },
          { villageName: 'Jagraon Gate', tehsil: 'Jagraon', district: 'Ludhiana', farmerCount: 14, isVisited: false },
        ],
        availableComm: 8600,
        pendingComm: 2800,
        vestedComm: 5800,
        totalEarned: 24500,
      },
      {
        name: 'Manpreet Kaur',
        phone: '+919876543212',
        email: 'agent3@profarmer.com',
        agentCode: 'AG-7890',
        clusters: [
          { villageName: 'Malerkotla West', tehsil: 'Malerkotla', district: 'Malerkotla', farmerCount: 31, isVisited: true, lastVisitedAt: new Date(Date.now() - 259200000) },
          { villageName: 'Amargarh Belt', tehsil: 'Amargarh', district: 'Malerkotla', farmerCount: 11, isVisited: false },
        ],
        availableComm: 19800,
        pendingComm: 6200,
        vestedComm: 13600,
        totalEarned: 52000,
      },
    ];

    const createdAgents = [];
    for (const a of agentUsersData) {
      const user = await User.create({
        name: a.name,
        phone: a.phone,
        email: a.email,
        password: 'Password@123',
        role: 'agent',
        status: 'active',
        avatarUrl: `https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80`,
      });

      const profile = await AgentProfile.create({
        userId: user._id,
        agentCode: a.agentCode,
        coverageClusters: a.clusters,
        totalReferredFarmers: a.clusters.reduce((sum, c) => sum + c.farmerCount, 0),
        activeFarmersCount: Math.round(a.clusters.reduce((sum, c) => sum + c.farmerCount, 0) * 0.8),
        commissionBalance: a.availableComm,
        pendingCommission: a.pendingComm,
        vestedCommission: a.vestedComm,
        totalEarnedAllTime: a.totalEarned,
        kycStatus: 'approved',
        bankDetails: {
          accountHolder: a.name,
          accountNumber: '9182390192831',
          ifsc: 'PUNB0029300',
          bankName: 'Punjab National Bank',
          isVerified: true,
        },
      });

      await Wallet.create({
        userId: user._id,
        userRole: 'agent',
        balance: a.availableComm,
        pendingBalance: a.pendingComm,
        vestedBalance: a.vestedComm,
        totalEarned: a.totalEarned,
      });

      createdAgents.push({ user, profile });
    }

    // 5. Create Service Providers
    console.log('[Seeder] Creating Service Providers & Fleets...');
    const providerUsersData = [
      {
        name: 'Harpal Singh',
        phone: '+919812300001',
        email: 'provider1@profarmer.com',
        contractorId: 'PR-88219',
        enterpriseName: 'Kisan Agri Mechanization Hub',
        primaryCategory: 'Harvesting & Mechanization',
        serviceTags: ['Combine Harvester', 'Laser Leveler', 'Tractor 4WD', 'Drone Sprayer'],
        isOnline: true,
        fleet: [
          {
            machineryType: 'Combine Harvester',
            model: 'New Holland TC5.30',
            horsepower: 101,
            year: 2023,
            regPlateNumber: 'PB-11-CB-8921',
            implements: ['SMS Chopper', 'Paddy Track Kit'],
            driverName: 'Gurpreet Singh',
            driverPhone: '+919812300091',
            isAvailable: true,
          },
          {
            machineryType: 'Agri-Drone Sprayer',
            model: 'DJI Agras T40 Hexacopter',
            horsepower: 24,
            year: 2024,
            regPlateNumber: 'DGCA-UIN-7842',
            implements: ['Centrifugal Atomizer Nozzles', 'Granular Spreader'],
            driverName: 'Sandeep Sharma (Certified Pilot)',
            driverPhone: '+919812300092',
            isAvailable: true,
          },
          {
            machineryType: 'Laser Land Leveler',
            model: 'John Deere 5310 Dual Laser',
            horsepower: 55,
            year: 2022,
            regPlateNumber: 'PB-11-AZ-1144',
            implements: ['Spectra Precision Scraper 8ft'],
            driverName: 'Avtar Singh',
            driverPhone: '+919812300093',
            isAvailable: true,
          },
        ],
        metrics: {
          acceptanceRate: 98.4,
          rating: 4.92,
          totalReviews: 142,
          onTimeArrivalRate: 96.0,
          equipmentUptimeIndex: 99.0,
          jobsCompletedToday: 3,
          operatingHoursToday: 6.5,
          acreageCoveredToday: 21,
        },
        earnings: {
          today: 14200,
          weekly: 68400,
          monthly: 245000,
          totalAllTime: 780000,
          availableBalance: 48650,
        },
      },
      {
        name: 'Baldev Brar',
        phone: '+919812300002',
        email: 'provider2@profarmer.com',
        contractorId: 'PR-66410',
        enterpriseName: 'Brar Precision Farm Center',
        primaryCategory: 'Tillage & Sowing',
        serviceTags: ['Tractor 4WD', 'Rotavator', 'Precision Seed Drill'],
        isOnline: true,
        fleet: [
          {
            machineryType: 'Tractor 4WD',
            model: 'Mahindra Yuvo Tech+ 575 4WD',
            horsepower: 47,
            year: 2023,
            regPlateNumber: 'PB-10-BT-4509',
            implements: ['7-Foot Heavy Rotavator', 'Shaktiman Seed Drill'],
            driverName: 'Karamjit Singh',
            driverPhone: '+919812300094',
            isAvailable: true,
          },
        ],
        metrics: {
          acceptanceRate: 95.0,
          rating: 4.88,
          totalReviews: 64,
          onTimeArrivalRate: 94.0,
          equipmentUptimeIndex: 97.5,
          jobsCompletedToday: 1,
          operatingHoursToday: 3.0,
          acreageCoveredToday: 8,
        },
        earnings: {
          today: 7200,
          weekly: 34800,
          monthly: 118000,
          totalAllTime: 420000,
          availableBalance: 29400,
        },
      },
      {
        name: 'Simranjit Sandhu',
        phone: '+919812300003',
        email: 'provider3@profarmer.com',
        contractorId: 'PR-33291',
        enterpriseName: 'Sandhu Custom Hiring Depot',
        primaryCategory: 'Harvesting & Mechanization',
        serviceTags: ['Combine Harvester', 'Baler / Straw Reaper'],
        isOnline: false,
        fleet: [
          {
            machineryType: 'Combine Harvester',
            model: 'Claas Crop Tiger 30 Terra Trac',
            horsepower: 60,
            year: 2021,
            regPlateNumber: 'PB-13-EF-9021',
            implements: ['Paddy Harvester Bar'],
            driverName: 'Jagtar Singh',
            driverPhone: '+919812300095',
            isAvailable: false,
          },
        ],
        metrics: {
          acceptanceRate: 91.2,
          rating: 4.75,
          totalReviews: 48,
          onTimeArrivalRate: 92.0,
          equipmentUptimeIndex: 96.0,
          jobsCompletedToday: 0,
          operatingHoursToday: 0,
          acreageCoveredToday: 0,
        },
        earnings: {
          today: 0,
          weekly: 18400,
          monthly: 92000,
          totalAllTime: 310000,
          availableBalance: 16800,
        },
      },
    ];

    const createdProviders = [];
    for (const p of providerUsersData) {
      const user = await User.create({
        name: p.name,
        phone: p.phone,
        email: p.email,
        password: 'Password@123',
        role: 'provider',
        status: 'active',
        avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
      });

      const profile = await ProviderProfile.create({
        userId: user._id,
        contractorId: p.contractorId,
        enterpriseName: p.enterpriseName,
        primaryCategory: p.primaryCategory,
        serviceTags: p.serviceTags,
        isOnline: p.isOnline,
        coverageRadiusKm: 40,
        machineryFleet: p.fleet,
        metrics: p.metrics,
        earnings: p.earnings,
        kycStatus: 'approved',
        bankDetails: {
          accountHolder: p.name,
          accountNumber: '50100234918231',
          ifsc: 'HDFC0001290',
          bankName: 'HDFC Bank Ltd',
          isVerified: true,
        },
        kycDocuments: [
          {
            type: 'machinery_rc',
            title: 'Commercial RC Book PB-11-CB-8921',
            fileUrl: '/uploads/sample_rc.pdf',
            status: 'approved',
          },
          {
            type: 'commercial_driver_license',
            title: 'Heavy Vehicle Commercial Driving License',
            fileUrl: '/uploads/sample_dl.pdf',
            status: 'approved',
          },
        ],
      });

      await Wallet.create({
        userId: user._id,
        userRole: 'provider',
        balance: p.earnings.availableBalance,
        totalEarned: p.earnings.totalAllTime,
      });

      createdProviders.push({ user, profile });
    }

    // 6. Create Farmers
    console.log('[Seeder] Creating Farmers...');
    const farmersData = [
      {
        name: 'Sukhwinder Singh',
        phone: '+919888800001',
        email: 'farmer1@profarmer.com',
        status: 'active',
        kycStatus: 'approved',
        farmName: 'Sukhwinder Organic Agri Farm',
        totalLandSize: 14,
        landUnit: 'acres',
        farmingBackground: 'owner_cultivator',
        village: 'Nabha Rural',
        tehsilBlock: 'Nabha',
        district: 'Patiala',
        state: 'Punjab',
        referredBy: createdAgents[0].user._id,
        parcels: [
          { name: 'Khasra #42 Canal Facing', acreage: 8, soilType: 'Alluvial', irrigationSource: 'Canal + Tubewell' },
          { name: 'East Road Plot #12', acreage: 6, soilType: 'Sandy Loam', irrigationSource: 'Tubewell' },
        ],
      },
      {
        name: 'Jagjit Singh',
        phone: '+919888800002',
        email: 'farmer2@profarmer.com',
        status: 'pending_verification',
        kycStatus: 'pending',
        farmName: 'Green Furrows Farm',
        totalLandSize: 9,
        landUnit: 'acres',
        farmingBackground: 'owner_cultivator',
        village: 'Samrala Hub',
        tehsilBlock: 'Samrala',
        district: 'Ludhiana',
        state: 'Punjab',
        referredBy: createdAgents[0].user._id,
        parcels: [{ name: 'North Parcel #7', acreage: 9, soilType: 'Alluvial', irrigationSource: 'Tubewell' }],
      },
      {
        name: 'Balwinder Kaur',
        phone: '+919888800003',
        email: 'farmer3@profarmer.com',
        status: 'active',
        kycStatus: 'approved',
        farmName: 'Kaur Agro Lands',
        totalLandSize: 22,
        landUnit: 'acres',
        farmingBackground: 'owner_cultivator',
        village: 'Raikot North',
        tehsilBlock: 'Raikot',
        district: 'Ludhiana',
        state: 'Punjab',
        referredBy: createdAgents[1].user._id,
        parcels: [
          { name: 'Paddy Belt Main', acreage: 12, soilType: 'Clay Loam', irrigationSource: 'Tubewell' },
          { name: 'Tubewell Block B', acreage: 10, soilType: 'Alluvial', irrigationSource: 'Tubewell' },
        ],
      },
      {
        name: 'Tarsem Lal',
        phone: '+919888800004',
        email: 'farmer4@profarmer.com',
        status: 'action_needed',
        kycStatus: 'action_needed',
        farmName: 'Kisan Parivar Plot',
        totalLandSize: 4.5,
        landUnit: 'acres',
        farmingBackground: 'tenant_farmer',
        village: 'Khanna Mandi',
        tehsilBlock: 'Khanna',
        district: 'Ludhiana',
        state: 'Punjab',
        referredBy: createdAgents[0].user._id,
        parcels: [{ name: 'Leased Parcel #1', acreage: 4.5, soilType: 'Alluvial', irrigationSource: 'Canal' }],
      },
    ];

    const createdFarmers = [];
    for (const f of farmersData) {
      const user = await User.create({
        name: f.name,
        phone: f.phone,
        email: f.email,
        password: 'Password@123',
        role: 'farmer',
        status: f.status,
        avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
      });

      const profile = await FarmerProfile.create({
        userId: user._id,
        farmName: f.farmName,
        totalLandSize: f.totalLandSize,
        landUnit: f.landUnit,
        farmingBackground: f.farmingBackground,
        village: f.village,
        tehsilBlock: f.tehsilBlock,
        district: f.district,
        state: f.state,
        referredByAgentId: f.referredBy,
        kycStatus: f.kycStatus,
        parcels: f.parcels,
        kycDocuments: [
          {
            type: 'identity_aadhaar',
            title: 'Aadhaar Card Copy',
            fileUrl: '/uploads/sample_aadhaar.pdf',
            status: f.kycStatus,
          },
          {
            type: 'land_record_khasra',
            title: 'Fard / Khasra Khatauni Land Record',
            fileUrl: '/uploads/sample_land_record.pdf',
            status: f.kycStatus,
          },
        ],
      });

      await Wallet.create({
        userId: user._id,
        userRole: 'farmer',
        balance: 0,
      });

      createdFarmers.push({ user, profile });
    }

    // 7. Create Realistic Bookings
    console.log('[Seeder] Creating Dispatch Bookings across full lifecycle...');
    const bookingsData = [
      // Booking 1: In Progress with Live OTP
      {
        bookingNumber: 'PF-2026-8942',
        farmerId: createdFarmers[0].user._id,
        providerId: createdProviders[0].user._id,
        agentId: createdAgents[0].user._id,
        serviceId: services[0]._id, // Laser Leveler
        parcelDetails: {
          name: 'Khasra #42 Canal Facing',
          acreage: 8,
          cropType: 'Paddy Field Preparation',
          village: 'Nabha Rural',
          tehsil: 'Nabha',
          district: 'Patiala',
          approachRoadNotes: 'Paved pucca road up to farm tubewell gate',
          location: { type: 'Point', coordinates: [75.8573, 30.901] },
        },
        scheduledDate: new Date(),
        timeSlot: 'morning',
        status: 'in_progress',
        startOtp: '4921',
        pricing: {
          unitPrice: 950,
          units: 8,
          baseAmount: 7600,
          couponDiscount: 0,
          platformFee: 380,
          taxes: 380,
          totalAmount: 8360,
          agentCommissionAmount: 760,
          providerPayoutAmount: 6460,
        },
        payment: {
          method: 'upi',
          status: 'escrow_locked',
          transactionId: 'TXN-UPI-98241289',
        },
        liveTracking: {
          latitude: 30.904,
          longitude: 75.859,
          heading: 45,
          speed: 12,
          updatedAt: new Date(),
        },
        timeline: [
          { status: 'pending_broadcast', note: 'Booking submitted by farmer', timestamp: new Date(Date.now() - 7200000) },
          { status: 'assigned', note: 'Accepted by Harpal Singh (Kisan Agri Hub)', timestamp: new Date(Date.now() - 5400000) },
          { status: 'en_route', note: 'Machinery dispatched from depot', timestamp: new Date(Date.now() - 3600000) },
          { status: 'arrived', note: 'Tractor and laser bucket reached field', timestamp: new Date(Date.now() - 1800000) },
          { status: 'in_progress', note: 'Farmer verified 4-digit OTP 4921. Acreage leveling active.', timestamp: new Date(Date.now() - 1200000) },
        ],
      },
      // Booking 2: En Route
      {
        bookingNumber: 'PF-2026-9104',
        farmerId: createdFarmers[2].user._id,
        providerId: createdProviders[0].user._id,
        agentId: createdAgents[1].user._id,
        serviceId: services[2]._id, // Drone Sprayer
        parcelDetails: {
          name: 'Paddy Belt Main',
          acreage: 12,
          cropType: 'Basmati Paddy (Nano Urea Spray)',
          village: 'Raikot North',
          tehsil: 'Raikot',
          district: 'Ludhiana',
          location: { type: 'Point', coordinates: [75.602, 30.648] },
        },
        scheduledDate: new Date(),
        timeSlot: 'afternoon',
        status: 'en_route',
        startOtp: '8172',
        pricing: {
          unitPrice: 450,
          units: 12,
          baseAmount: 5400,
          couponDiscount: 500,
          platformFee: 270,
          taxes: 270,
          totalAmount: 5440,
          agentCommissionAmount: 540,
          providerPayoutAmount: 4590,
        },
        payment: {
          method: 'kcc',
          status: 'escrow_locked',
          transactionId: 'TXN-KCC-81920381',
        },
        liveTracking: {
          latitude: 30.638,
          longitude: 75.594,
          heading: 88,
          speed: 42,
          updatedAt: new Date(),
        },
        timeline: [
          { status: 'pending_broadcast', note: 'Booking submitted', timestamp: new Date(Date.now() - 4000000) },
          { status: 'assigned', note: 'DJI Drone Pilot Sandeep Sharma assigned', timestamp: new Date(Date.now() - 3000000) },
          { status: 'en_route', note: 'Drone van en-route. ETA 18 mins.', timestamp: new Date(Date.now() - 1000000) },
        ],
      },
      // Booking 3: Pending Broadcast (Urgent incoming request for providers)
      {
        bookingNumber: 'PF-2026-9218',
        farmerId: createdFarmers[0].user._id,
        providerId: null,
        agentId: createdAgents[0].user._id,
        serviceId: services[4]._id, // Combine Harvester
        parcelDetails: {
          name: 'East Road Plot #12',
          acreage: 6,
          cropType: 'Wheat Harvesting',
          village: 'Nabha Rural',
          tehsil: 'Nabha',
          district: 'Patiala',
          location: { type: 'Point', coordinates: [75.858, 30.903] },
        },
        scheduledDate: new Date(Date.now() + 86400000),
        timeSlot: 'morning',
        status: 'pending_broadcast',
        startOtp: '3350',
        pricing: {
          unitPrice: 2400,
          units: 6,
          baseAmount: 14400,
          couponDiscount: 0,
          platformFee: 720,
          taxes: 720,
          totalAmount: 15840,
          agentCommissionAmount: 1440,
          providerPayoutAmount: 12240,
        },
        payment: {
          method: 'upi',
          status: 'escrow_locked',
          transactionId: 'TXN-UPI-99238411',
        },
        timeline: [
          { status: 'pending_broadcast', note: 'Urgent harvest dispatch broadcast to area providers', timestamp: new Date() },
        ],
      },
      // Booking 4: Completed with Work Certificate and Review
      {
        bookingNumber: 'PF-2026-7810',
        farmerId: createdFarmers[0].user._id,
        providerId: createdProviders[0].user._id,
        agentId: createdAgents[0].user._id,
        serviceId: services[1]._id, // Rotavator
        parcelDetails: {
          name: 'Khasra #42 Canal Facing',
          acreage: 8,
          cropType: 'Seedbed Preparation',
          village: 'Nabha Rural',
          tehsil: 'Nabha',
          district: 'Patiala',
          location: { type: 'Point', coordinates: [75.8573, 30.901] },
        },
        scheduledDate: new Date(Date.now() - 172800000),
        timeSlot: 'morning',
        status: 'completed',
        startOtp: '2291',
        pricing: {
          unitPrice: 1200,
          units: 8,
          baseAmount: 9600,
          couponDiscount: 0,
          platformFee: 480,
          taxes: 480,
          totalAmount: 10560,
          agentCommissionAmount: 960,
          providerPayoutAmount: 8160,
        },
        payment: {
          method: 'upi',
          status: 'settled',
          transactionId: 'TXN-UPI-77192381',
          paidAt: new Date(Date.now() - 172800000),
        },
        completionSignoff: {
          acreageWorked: 8,
          operatorNotes: 'Clean, uniform furrows. Soil pulverized to fine tilth.',
          fieldPhotoUrl: 'https://images.unsplash.com/photo-1594771804886-a933bb2d609b?auto=format&fit=crop&w=600&q=80',
          completedAt: new Date(Date.now() - 160000000),
          farmerRating: 5,
          farmerReview: 'Outstanding tractor work! Punctual arrival and clean furrows.',
        },
        timeline: [
          { status: 'pending_broadcast', note: 'Order placed', timestamp: new Date(Date.now() - 200000000) },
          { status: 'assigned', note: 'Assigned to Harpal Singh', timestamp: new Date(Date.now() - 190000000) },
          { status: 'in_progress', note: 'Job started with OTP 2291', timestamp: new Date(Date.now() - 170000000) },
          { status: 'completed', note: 'Work completed and certificate signed', timestamp: new Date(Date.now() - 160000000) },
        ],
      },
    ];

    const createdBookings = await Booking.insertMany(bookingsData);

    // 8. Create Review for completed booking
    console.log('[Seeder] Creating Customer Review...');
    await Review.create({
      bookingId: createdBookings[3]._id,
      farmerId: createdFarmers[0].user._id,
      providerId: createdProviders[0].user._id,
      rating: 5,
      comment: 'Outstanding tractor work! Punctual arrival and clean furrows.',
      complimentTags: ['Punctual', 'Clean Furrows', 'Fast Operator'],
      cropVariety: 'Seedbed Prep',
      acreage: 8,
      providerReply: 'Thank you Sukhwinder Ji. Always happy to serve your farm!',
      repliedAt: new Date(Date.now() - 150000000),
    });

    // 9. Create Commission Record for Agent
    console.log('[Seeder] Creating Commission Records...');
    await CommissionRecord.create({
      agentId: createdAgents[0].user._id,
      farmerId: createdFarmers[0].user._id,
      bookingId: createdBookings[3]._id,
      bookingNumber: createdBookings[3].bookingNumber,
      totalBookingAmount: createdBookings[3].pricing.totalAmount,
      commissionPercent: 10,
      commissionAmount: 960,
      status: 'vested',
      vestDate: new Date(Date.now() - 86400000),
      vestedAt: new Date(Date.now() - 86400000),
    });

    // 10. Create Payout Requests for Admin testing
    console.log('[Seeder] Creating Payout Requests for Admin review...');
    await PayoutRequest.create({
      payoutNumber: 'PO-2026-0001',
      userId: createdProviders[0].user._id,
      userRole: 'provider',
      amount: 25000,
      bankDetails: {
        accountHolder: 'Harpal Singh',
        accountNumber: '50100234918231',
        ifsc: 'HDFC0001290',
        bankName: 'HDFC Bank Ltd',
      },
      status: 'pending',
    });

    await PayoutRequest.create({
      payoutNumber: 'PO-2026-0002',
      userId: createdAgents[0].user._id,
      userRole: 'agent',
      amount: 8000,
      bankDetails: {
        accountHolder: 'Jaspreet Singh',
        accountNumber: '9182390192831',
        ifsc: 'PUNB0029300',
        bankName: 'Punjab National Bank',
      },
      status: 'pending',
    });

    // 11. Create Notifications
    console.log('[Seeder] Creating In-App Notifications...');
    await Notification.create({
      recipientId: createdFarmers[0].user._id,
      recipientRole: 'farmer',
      title: 'Machinery Operating at Field',
      body: 'Booking #PF-2026-8942 is currently active. 4.2 acres completed.',
      type: 'booking_update',
    });

    await Notification.create({
      recipientId: createdProviders[0].user._id,
      recipientRole: 'provider',
      title: 'Urgent Dispatch Alert Nearby',
      body: 'New harvest request #PF-2026-9218 in Nabha Rural (6 acres). Tap to accept.',
      type: 'dispatch_alert',
    });

    // 12. Create Initial Audit Log
    console.log('[Seeder] Creating Initial Audit Log...');
    await AuditLog.create({
      adminId: adminUser._id,
      adminEmail: adminUser.email,
      action: 'SYSTEM_INITIALIZATION',
      targetType: 'system',
      details: {
        message: 'ProFarmer Agricultural Platform Ecosystem seeded with full initial catalog, KYC queues, and test accounts.',
      },
    });

    console.log('\n======================================================');
    console.log('✅ SEEDING COMPLETE! PRODUCING SYSTEM SUMMARY:');
    console.log('------------------------------------------------------');
    console.log('👑 Admin Console Credentials:');
    console.log('   Email:    admin@profarmer.com');
    console.log('   Password: Admin@123456');
    console.log('   Phone:    +919876500000');
    console.log('------------------------------------------------------');
    console.log('🌾 Farmer Accounts:');
    console.log('   1. Sukhwinder Singh (Active, KYC Approved): +919888800001 (Password: Password@123)');
    console.log('   2. Jagjit Singh     (Pending KYC Review):   +919888800002 (Password: Password@123)');
    console.log('------------------------------------------------------');
    console.log('💼 Field Agent Accounts:');
    console.log('   1. Jaspreet Singh (AG-9821): +919876543210 (Password: Password@123)');
    console.log('   2. Gurinder Dhillon (AG-4512): +919876543211 (Password: Password@123)');
    console.log('------------------------------------------------------');
    console.log('🚜 Service Provider Accounts:');
    console.log('   1. Harpal Singh (Kisan Agri Hub, PR-88219): +919812300001 (Password: Password@123)');
    console.log('   2. Baldev Brar  (Brar Farm Fleet, PR-66410): +919812300002 (Password: Password@123)');
    console.log('======================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('[Seeder] Error during seeding:', error);
    process.exit(1);
  }
};

seedData();
