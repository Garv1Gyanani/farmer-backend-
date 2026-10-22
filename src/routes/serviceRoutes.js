const express = require('express');
const router = express.Router();
const {
  getCategories,
  getServices,
  getServiceById,
  checkAvailability,
} = require('../controllers/serviceController');

// Public catalog endpoints for farmer & provider apps
router.get('/categories', getCategories);
router.get('/', getServices);
router.get('/:id', getServiceById);
router.post('/availability', checkAvailability);

module.exports = router;
