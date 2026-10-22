const express = require('express');
const router = express.Router();
const {
  getFarmerProfile,
  updateFarmDetails,
  addParcel,
  deleteParcel,
  uploadKycDocument,
  getParcelSoilReport,
  saveSoilReport,
  getFarmerBookings,
  getFarmerHomeFeed,
} = require('../controllers/farmerController');
const { protect, authorize } = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.use(protect);

router.get('/home-feed', getFarmerHomeFeed);
router.get('/profile', getFarmerProfile);
router.put('/profile/farm-details', updateFarmDetails);
router.post('/parcels', addParcel);
router.delete('/parcels/:parcelId', deleteParcel);
router.get('/parcels/:parcelId/soil-report', getParcelSoilReport);
router.post('/parcels/:parcelId/soil-report', saveSoilReport);
router.post('/kyc/upload', upload.single('document'), uploadKycDocument);
router.get('/bookings', getFarmerBookings);

module.exports = router;
