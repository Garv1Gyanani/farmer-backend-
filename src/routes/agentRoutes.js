const express = require('express');
const router = express.Router();
const {
  getAgentDashboard,
  getReferredFarmers,
  registerFarmerByAgent,
  getCommissionLedger,
  requestCommissionWithdrawal,
  getAssignedVillages,
  markVillageVisited,
  getFarmerDetailsForAgent,
  getVillageFarmers,
} = require('../controllers/agentController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);

router.get('/dashboard', getAgentDashboard);
router.get('/farmers', getReferredFarmers);
router.get('/farmers/:farmerId', getFarmerDetailsForAgent);
router.post('/farmers/register', registerFarmerByAgent);
router.get('/commissions', getCommissionLedger);
router.post('/commissions/withdraw', requestCommissionWithdrawal);
router.get('/villages', getAssignedVillages);
router.get('/villages/:clusterId/farmers', getVillageFarmers);
router.put('/villages/:clusterId/visit', markVillageVisited);

module.exports = router;
