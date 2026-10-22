const express = require('express');
const router = express.Router();
const { fetchAgriWeather } = require('../services/weatherService');

// GET /api/weather?lat=...&lng=...
router.get('/', async (req, res, next) => {
  try {
    const lat = parseFloat(req.query.lat) || 30.9010;
    const lng = parseFloat(req.query.lng) || 75.8573;
    const weatherData = await fetchAgriWeather(lat, lng);
    res.status(200).json(weatherData);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
