const EARTH_RADIUS_KM = 6371;

/**
 * Calculate distance between two lat/lng points using the Haversine formula.
 * @param {number} lat1 - Latitude of point 1 (degrees)
 * @param {number} lon1 - Longitude of point 1 (degrees)
 * @param {number} lat2 - Latitude of point 2 (degrees)
 * @param {number} lon2 - Longitude of point 2 (degrees)
 * @returns {number} Distance in kilometers
 */
const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

/**
 * Convert kilometers to meters.
 */
const kmToMeters = (km) => km * 1000;

/**
 * Check if a point is within a given radius (km) of a center.
 */
const isWithinRadius = (centerLat, centerLon, pointLat, pointLon, radiusKm) => {
  return haversineDistanceKm(centerLat, centerLon, pointLat, pointLon) <= radiusKm;
};

/**
 * Sort an array of {lat, lon, ...} objects by distance from a center point.
 */
const sortByDistance = (points, centerLat, centerLon) => {
  return points
    .map((p) => ({
      ...p,
      distanceKm: haversineDistanceKm(centerLat, centerLon, p.lat, p.lon),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
};

module.exports = { haversineDistanceKm, kmToMeters, isWithinRadius, sortByDistance };
