const express = require('express');
const router = express.Router();
const {
  reverseGeocode,
  geocodeAddress,
  getDistanceMatrix,
  autocompletePlaces,
  getApiKey,
} = require('../services/mapsService');
const { protect } = require('../middleware/authMiddleware');

// GET /api/maps/config - Public/Client Key config for Map UI initialization
router.get('/config', (req, res) => {
  const key = getApiKey();
  res.status(200).json({
    success: true,
    hasKey: Boolean(key),
    apiKey: key,
  });
});

// GET /api/maps/reverse-geocode?lat=...&lng=...
router.get('/reverse-geocode', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ success: false, message: 'Valid lat and lng query params are required.' });
    }

    const data = await reverseGeocode(lat, lng);
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
});

// GET /api/maps/geocode?address=...
router.get('/geocode', async (req, res, next) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ success: false, message: 'Address query parameter is required.' });
    }

    const data = await geocodeAddress(address);
    res.status(200).json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
});

// POST /api/maps/distance - Calculate machinery transit route
router.post('/distance', async (req, res, next) => {
  try {
    const { origin, destination } = req.body;
    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        message: 'Origin and destination coordinates {lat, lng} are required.',
      });
    }

    const data = await getDistanceMatrix(origin, destination);
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/maps/autocomplete?input=...
router.get('/autocomplete', async (req, res, next) => {
  try {
    const { input } = req.query;
    if (!input) {
      return res.status(200).json({ success: true, predictions: [] });
    }

    const predictions = await autocompletePlaces(input);
    res.status(200).json({ success: true, predictions });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
