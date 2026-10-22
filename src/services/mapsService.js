/**
 * ProFarmer Google Maps & Rural Geospatial Service
 * Handles reverse geocoding, village autocomplete, distance matrix calculations,
 * and machinery transit time estimation between provider base and farm parcels.
 */

const getApiKey = () => {
  return process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || '';
};

/**
 * Reverse Geocode: [lat, lng] -> Rural Address (Village, Tehsil, District, State, PIN)
 */
const reverseGeocode = async (lat, lng) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Google Maps API key is not configured.');
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' || !data.results || data.results.length === 0) {
    return {
      formattedAddress: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      village: 'Village Area',
      tehsil: '',
      district: 'Punjab',
      state: 'Punjab',
      postalCode: '',
      components: [],
    };
  }

  const result = data.results[0];
  const components = result.address_components || [];

  let village = '';
  let tehsil = '';
  let district = '';
  let state = '';
  let postalCode = '';

  components.forEach((c) => {
    if (c.types.includes('sublocality_level_1') || c.types.includes('locality')) {
      if (!village) village = c.long_name;
    }
    if (c.types.includes('administrative_area_level_3') || c.types.includes('sublocality_level_2')) {
      tehsil = c.long_name;
    }
    if (c.types.includes('administrative_area_level_2')) {
      district = c.long_name;
    }
    if (c.types.includes('administrative_area_level_1')) {
      state = c.long_name;
    }
    if (c.types.includes('postal_code')) {
      postalCode = c.long_name;
    }
  });

  return {
    formattedAddress: result.formatted_address,
    village: village || tehsil || 'Rural Zone',
    tehsil: tehsil || district,
    district: district || 'Ludhiana',
    state: state || 'Punjab',
    postalCode,
    location: { lat, lng },
    placeId: result.place_id,
  };
};

/**
 * Geocode Address string -> Coordinates [lat, lng]
 */
const geocodeAddress = async (address) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Google Maps API key is not configured.');

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&components=country:in&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' || !data.results?.length) {
    throw new Error(`Location not found for: "${address}"`);
  }

  const result = data.results[0];
  return {
    formattedAddress: result.formatted_address,
    location: result.geometry.location,
    placeId: result.place_id,
    addressComponents: result.address_components,
  };
};

/**
 * Distance Matrix: Machinery Base -> Farm Parcel
 * Returns road distance in km and transit duration in minutes
 */
const getDistanceMatrix = async (origin, destination) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Google Maps API key is not configured.');

  const originStr = `${origin.lat || origin[1]},${origin.lng || origin[0]}`;
  const destStr = `${destination.lat || destination[1]},${destination.lng || destination[0]}`;

  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originStr}&destinations=${destStr}&mode=driving&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'OK' && data.rows?.[0]?.elements?.[0]?.status === 'OK') {
    const elem = data.rows[0].elements[0];
    const distanceKm = Number((elem.distance.value / 1000).toFixed(1));
    const durationMinutes = Math.round(elem.duration.value / 60);

    // Heavy tractor / combine road travel calculation (typically 20-30 km/h)
    const machineryTransitDurationMinutes = Math.max(durationMinutes, Math.round(distanceKm * 2.5));

    return {
      success: true,
      distanceKm,
      distanceText: elem.distance.text,
      durationMinutes,
      durationText: elem.duration.text,
      machineryTransitDurationMinutes,
      machineryTransitText: `${machineryTransitDurationMinutes} mins (heavy agri-transit)`,
    };
  }

  // Fallback Haversine if Google Distance Matrix returns zero routes
  const [lat1, lon1] = [origin.lat || origin[1], origin.lng || origin[0]];
  const [lat2, lon2] = [destination.lat || destination[1], destination.lng || destination[0]];
  const R = 6371; // km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const haversineKm = Number((R * c * 1.3).toFixed(1)); // 1.3 road winding factor
  const estMins = Math.round(haversineKm * 2.5);

  return {
    success: true,
    source: 'haversine_approximation',
    distanceKm: haversineKm,
    distanceText: `${haversineKm} km`,
    durationMinutes: estMins,
    durationText: `${estMins} mins`,
    machineryTransitDurationMinutes: estMins,
    machineryTransitText: `${estMins} mins`,
  };
};

/**
 * Autocomplete Places (Villages, Mandis, Towns)
 */
const autocompletePlaces = async (input) => {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Google Maps API key is not configured.');

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&components=country:in&key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.status !== 'OK' || !data.predictions) {
    return [];
  }

  return data.predictions.map((p) => ({
    placeId: p.place_id,
    description: p.description,
    mainText: p.structured_formatting?.main_text,
    secondaryText: p.structured_formatting?.secondary_text,
  }));
};

module.exports = {
  reverseGeocode,
  geocodeAddress,
  getDistanceMatrix,
  autocompletePlaces,
  getApiKey,
};
