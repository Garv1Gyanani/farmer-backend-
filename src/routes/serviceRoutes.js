const express = require('express');
const router = express.Router();
const {
  getCategories,
  getServices,
  getServiceById,
  checkAvailability,
} = require('../controllers/serviceController');
const { createProviderService } = require('../controllers/providerController');
const { getBookingConfig } = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');

// Public catalog endpoints for farmer & provider apps
router.get('/categories', getCategories);
router.get('/booking-config', getBookingConfig);
router.get('/', getServices);
router.get('/:id', getServiceById);
router.post('/availability', checkAvailability);

// Also accept service creation from providers at /api/services
router.post('/', protect, createProviderService);

module.exports = router;
