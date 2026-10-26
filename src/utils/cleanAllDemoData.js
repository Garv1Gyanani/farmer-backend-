require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const FarmerProfile = require('../models/FarmerProfile');
const ProviderProfile = require('../models/ProviderProfile');
const AgentProfile = require('../models/AgentProfile');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const PayoutRequest = require('../models/PayoutRequest');
const CommissionRecord = require('../models/CommissionRecord');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const Wallet = require('../models/Wallet');

async function clean() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB Atlas');

  // 1. Delete all demo bookings
  const bRes = await Booking.deleteMany({});
  console.log('Deleted Bookings:', bRes.deletedCount);

  // 2. Delete all demo transactions
  const txRes = await Transaction.deleteMany({});
  console.log('Deleted Transactions:', txRes.deletedCount);

  // 3. Delete all demo payout requests
  const pRes = await PayoutRequest.deleteMany({});
  console.log('Deleted PayoutRequests:', pRes.deletedCount);

  // 4. Delete all demo commission records
  const cRes = await CommissionRecord.deleteMany({});
  console.log('Deleted CommissionRecords:', cRes.deletedCount);

  // 5. Delete all demo reviews
  const rRes = await Review.deleteMany({});
  console.log('Deleted Reviews:', rRes.deletedCount);

  // 6. Delete all demo notifications
  const nRes = await Notification.deleteMany({});
  console.log('Deleted Notifications:', nRes.deletedCount);

  // 7. Delete all demo audit logs
  const aRes = await AuditLog.deleteMany({});
  console.log('Deleted AuditLogs:', aRes.deletedCount);

  // 8. Find demo / test users (non-admin users with 'test' in name or specific seed phones)
  const demoUsers = await User.find({
    role: { $ne: 'admin' },
    $or: [
      { name: { $regex: /test/i } },
      { phone: '+919876500001' },
      { phone: '+918989898989' },
      { phone: '+918585858586' },
      { phone: '7837373737' },
      { phone: '+918283283823' },
    ]
  });

  const demoUserIds = demoUsers.map(u => u._id);
  console.log(`Found ${demoUserIds.length} demo/test users to delete:`, demoUsers.map(u => `${u.name} (${u.phone})`));

  if (demoUserIds.length > 0) {
    await User.deleteMany({ _id: { $in: demoUserIds } });
    await FarmerProfile.deleteMany({ userId: { $in: demoUserIds } });
    await ProviderProfile.deleteMany({ userId: { $in: demoUserIds } });
    await AgentProfile.deleteMany({ userId: { $in: demoUserIds } });
    await Wallet.deleteMany({ userId: { $in: demoUserIds } });
    console.log('Deleted demo users and their profiles/wallets.');
  }

  // 9. Reset admin wallet balance to 0 if needed
  const adminUser = await User.findOne({ role: 'admin' });
  if (adminUser) {
    await Wallet.updateOne({ userId: adminUser._id }, { balance: 0, pendingPayout: 0, totalEarned: 0 });
    console.log('Admin wallet reset to 0.');
  }

  console.log('All demo data wiped successfully!');
  process.exit(0);
}

clean().catch(err => {
  console.error(err);
  process.exit(1);
});
