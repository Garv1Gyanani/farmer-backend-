const express = require('express');
const router = express.Router();
const {
  getDashboardKpis,
  getVerificationQueue,
  processVerification,
  getFarmersList,
  createFarmer,
  updateFarmer,
  addFarmerParcel,
  deleteFarmerParcel,
  creditFarmerWallet,
  getFarmerDossier,
  getAgentsList,
  createAgent,
  updateAgent,
  getProvidersList,
  createProvider,
  updateProvider,
  toggleUserStatus,
  getAllBookings,
  getPayoutRequests,
  processPayoutRequest,
  getAllTransactions,
  getCommissionRecords,
  createOrUpdateService,
  deleteService,
  createOrUpdateCategory,
  deleteCategory,
  getAuditLogs,
  triggerCommissionVesting,
  getVerificationHistory,
  getAdminProfile,
  updateAdminProfile,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Secure all admin routes to Admin role only
router.use(protect, authorize('admin'));

router.get('/kpis', getDashboardKpis);
router.get('/profile', getAdminProfile);
router.put('/profile', updateAdminProfile);
router.get('/verification/queue', getVerificationQueue);
router.get('/verification/history', getVerificationHistory);
router.put('/verification/:userRole/:targetId', processVerification);
router.get('/farmers', getFarmersList);
router.post('/farmers', createFarmer);
router.put('/farmers/:id', updateFarmer);
router.get('/farmers/:id/dossier', getFarmerDossier);
router.post('/farmers/:id/parcels', addFarmerParcel);
router.delete('/farmers/:id/parcels/:parcelId', deleteFarmerParcel);
router.post('/farmers/:id/wallet/credit', creditFarmerWallet);
router.get('/agents', getAgentsList);
router.post('/agents', createAgent);
router.put('/agents/:id', updateAgent);
router.get('/providers', getProvidersList);
router.post('/providers', createProvider);
router.put('/providers/:id', updateProvider);
router.put('/users/:userId/status', toggleUserStatus);
router.get('/bookings', getAllBookings);
router.get('/payouts', getPayoutRequests);
router.put('/payouts/:payoutId', processPayoutRequest);
router.get('/transactions', getAllTransactions);
router.get('/commissions', getCommissionRecords);
router.post('/commissions/vest-now', triggerCommissionVesting);
router.post('/services', createOrUpdateService);
router.put('/services/:id', createOrUpdateService);
router.delete('/services/:id', deleteService);
router.post('/categories', createOrUpdateCategory);
router.put('/categories/:id', createOrUpdateCategory);
router.delete('/categories/:id', deleteCategory);
router.get('/audit-logs', getAuditLogs);

module.exports = router;
