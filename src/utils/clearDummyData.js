require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const FarmerProfile = require('../models/FarmerProfile');
const AgentProfile = require('../models/AgentProfile');
const ProviderProfile = require('../models/ProviderProfile');
const Wallet = require('../models/Wallet');
const Booking = require('../models/Booking');
const PayoutRequest = require('../models/PayoutRequest');
const Transaction = require('../models/Transaction');

const clearDummyData = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('MONGODB_URI env variable is missing.');
      process.exit(1);
    }

    console.log('[ClearDummyData] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('[ClearDummyData] Connected successfully!');

    // Find all dummy users
    const dummyUsers = await User.find({
      role: { $ne: 'admin' },
      $or: [
        { email: { $regex: /@example\.com$/i } },
        { email: { $regex: /@profarmer\.com$/i } },
        { phone: { $regex: /^\+?9198888/ } },
        { phone: { $regex: /^\+?91987659/ } },
        { phone: { $regex: /^\+?9198988/ } },
        { phone: { $regex: /^\+?919876543/ } },
        { phone: { $regex: /^\+?919812345/ } },
      ],
    });

    const dummyUserIds = dummyUsers.map((u) => u._id);
    console.log(`[ClearDummyData] Found ${dummyUserIds.length} dummy users to remove.`);

    if (dummyUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: dummyUserIds } });
      await FarmerProfile.deleteMany({ userId: { $in: dummyUserIds } });
      await AgentProfile.deleteMany({ userId: { $in: dummyUserIds } });
      await ProviderProfile.deleteMany({ userId: { $in: dummyUserIds } });
      await Wallet.deleteMany({ userId: { $in: dummyUserIds } });
      await Booking.deleteMany({ farmerUserId: { $in: dummyUserIds } });
      await PayoutRequest.deleteMany({ userId: { $in: dummyUserIds } });
      await Transaction.deleteMany({ userId: { $in: dummyUserIds } });
      console.log('✅ Successfully removed all dummy seed records from MongoDB database!');
    } else {
      console.log('No dummy users found to clean.');
    }

    process.exit(0);
  } catch (err) {
    console.error('Error clearing dummy data:', err);
    process.exit(1);
  }
};

clearDummyData();
