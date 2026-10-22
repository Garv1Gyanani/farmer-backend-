const express = require('express');
const router = express.Router();
const { getWallet, getTransactions } = require('../controllers/walletController');
const { protect } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/balance', getWallet);
router.get('/transactions', getTransactions);

module.exports = router;
