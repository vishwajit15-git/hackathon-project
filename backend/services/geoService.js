/**
 * Zone Graph for Kumbh Mela — 10-zone layout.
 *
 * Zones: A (main ghat) → J (parking)
 * Edges represent adjacency. Weight = base traversal time in minutes.
 * Congestion modifies effective weight dynamically.
 */

const BASE_ZONE_GRAPH = {
  A: [{ zone: 'B', weight: 3 }, { zone: 'C', weight: 5 }],
  B: [{ zone: 'A', weight: 3 }, { zone: 'D', weight: 4 }, { zone: 'E', weight: 6 }],
  C: [{ zone: 'A', weight: 5 }, { zone: 'E', weight: 4 }, { zone: 'F', weight: 7 }],
  D: [{ zone: 'B', weight: 4 }, { zone: 'G', weight: 5 }],
  E: [{ zone: 'B', weight: 6 }, { zone: 'C', weight: 4 }, { zone: 'G', weight: 3 }, { zone: 'H', weight: 5 }],
  F: [{ zone: 'C', weight: 7 }, { zone: 'H', weight: 4 }, { zone: 'I', weight: 6 }],
  G: [{ zone: 'D', weight: 5 }, { zone: 'E', weight: 3 }, { zone: 'J', weight: 4 }],
  H: [{ zone: 'E', weight: 5 }, { zone: 'F', weight: 4 }, { zone: 'J', weight: 5 }],
  I: [{ zone: 'F', weight: 6 }, { zone: 'J', weight: 3 }],
  J: [{ zone: 'G', weight: 4 }, { zone: 'H', weight: 5 }, { zone: 'I', weight: 3 }],
};

// Zone metadata for context
const ZONE_META = {
  A: { name: 'Sangam Ghat (Main)', type: 'ghat', capacity: 5000 },
  B: { name: 'Triveni Ghat', type: 'ghat', capacity: 4000 },
  C: { name: 'Ram Ghat', type: 'ghat', capacity: 3500 },
  D: { name: 'Market Area North', type: 'market', capacity: 6000 },
  E: { name: 'Central Corridor', type: 'corridor', capacity: 8000 },
  F: { name: 'Camp Area West', type: 'camp', capacity: 10000 },
  G: { name: 'Medical Hub', type: 'medical', capacity: 2000 },
  H: { name: 'Volunteer Center', type: 'admin', capacity: 1500 },
  I: { name: 'Entry Gate Alpha', type: 'entry', capacity: 3000 },
  J: { name: 'Parking & Exit', type: 'exit', capacity: 15000 },
};

/**
 * Dijkstra shortest path between two zones.
 * crowdDensityMap: { ZONE: densityPercent } — used to penalize congested zones.
 */
const getSafeRoute = (fromZone, toZone, crowdDensityMap = {}) => {
  const from = fromZone.toUpperCase();
  const to = toZone.toUpperCase();

  if (!BASE_ZONE_GRAPH[from] || !BASE_ZONE_GRAPH[to]) {
    throw new Error(`Invalid zone: ${from} → ${to}`);
  }

  if (from === to) return { path: [from], totalCost: 0, estimatedMinutes: 0 };

  const dist = {};
  const prev = {};
  const visited = new Set();
  const queue = new Set(Object.keys(BASE_ZONE_GRAPH));

  // Initialize distances
  for (const zone of queue) {
    dist[zone] = Infinity;
    prev[zone] = null;
  }
  dist[from] = 0;

  while (queue.size > 0) {
    // Find node with minimum distance in queue
    let u = null;
    for (const zone of queue) {
      if (u === null || dist[zone] < dist[u]) u = zone;
    }

    if (u === to || dist[u] === Infinity) break;
    queue.delete(u);
    visited.add(u);

    for (const neighbor of BASE_ZONE_GRAPH[u]) {
      if (visited.has(neighbor.zone)) continue;

      // Congestion penalty: +50% weight per 10% above 70% density
      const density = crowdDensityMap[neighbor.zone] || 0;
      const congestionMultiplier = density > 70 ? 1 + ((density - 70) / 10) * 0.5 : 1;
      const effectiveWeight = neighbor.weight * congestionMultiplier;

      const alt = dist[u] + effectiveWeight;
      if (alt < dist[neighbor.zone]) {
        dist[neighbor.zone] = alt;
        prev[neighbor.zone] = u;
      }
    }
  }

  if (dist[to] === Infinity) {
    return { path: [], totalCost: Infinity, estimatedMinutes: null, error: 'No route found' };
  }

  // Reconstruct path
  const path = [];
  let curr = to;
  while (curr !== null) {
    path.unshift(curr);
    curr = prev[curr];
  }

  return {
    path,
    totalCost: Math.round(dist[to] * 10) / 10,
    estimatedMinutes: Math.round(dist[to]),
    zoneDetails: path.map((z) => ({ zone: z, ...ZONE_META[z] })),
  };
};

/**
 * Get all zones with their metadata.
 */
const getAllZones = () => {
  return Object.entries(ZONE_META).map(([id, meta]) => ({ id, ...meta }));
};

/**
 * Get neighbors of a zone.
 */
const getNeighbors = (zone) => {
  return BASE_ZONE_GRAPH[zone.toUpperCase()] || [];
};

/**
 * Find the least congested zones.
 */
const getLeastCongestedZones = (crowdDensityMap, count = 3) => {
  return Object.entries(crowdDensityMap)
    .sort(([, a], [, b]) => a - b)
    .slice(0, count)
    .map(([zone, density]) => ({ zone, density }));
};

module.exports = {
  getSafeRoute,
  getAllZones,
  getNeighbors,
  getLeastCongestedZones,
  ZONE_META,
  BASE_ZONE_GRAPH,
};
