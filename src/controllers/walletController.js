const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const PayoutRequest = require('../models/PayoutRequest');

// Get wallet balance
const getWallet = async (req, res, next) => {
  try {
    let wallet = await Wallet.findOne({ userId: req.user._id });
    if (!wallet) {
      wallet = await Wallet.create({
        userId: req.user._id,
        userRole: req.user.role,
        balance: 0,
      });
    }

    res.status(200).json({
      success: true,
      wallet,
    });
  } catch (error) {
    next(error);
  }
};

// Get transaction history
const getTransactions = async (req, res, next) => {
  try {
    const { type, limit = 20, page = 1 } = req.query;
    let query = { userId: req.user._id };

    if (type) {
      query.type = type;
    }

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Transaction.countDocuments(query);

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

module.exports = {
  getWallet,
  getTransactions,
};
