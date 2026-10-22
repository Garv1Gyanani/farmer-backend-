const express = require('express');
const router = express.Router();
const {
  getProviderDashboard,
  toggleOnlineStatus,
  getFleet,
  addMachinery,
  getJobs,
  acceptJob,
  updateJobStatus,
  verifyStartOtp,
  completeJob,
  getEarnings,
  requestPayout,
  getReviews,
  getDemandHeatmap,
  uploadProviderKyc,
} = require('../controllers/providerController');
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.use(protect);

router.get('/dashboard', getProviderDashboard);
router.post('/toggle-online', toggleOnlineStatus);
router.get('/fleet', getFleet);
router.post('/fleet', addMachinery);
router.get('/jobs', getJobs);
router.get('/demand-map', getDemandHeatmap);
router.post('/kyc/upload', upload.single('document'), uploadProviderKyc);
router.post('/jobs/:bookingId/accept', acceptJob);
router.put('/jobs/:bookingId/status', updateJobStatus);
router.post('/jobs/:bookingId/verify-otp', verifyStartOtp);
router.post('/jobs/:bookingId/complete', completeJob);
router.get('/earnings', getEarnings);
router.post('/earnings/withdraw', requestPayout);
router.get('/reviews', getReviews);

module.exports = router;
