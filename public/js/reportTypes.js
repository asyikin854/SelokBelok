// Report catalogue, shared by browser and server. `ttl` is minutes until a
// report expires unless drivers confirm it is still there.
export const REPORT_TYPES = {
  jam: { icon: '🚗', color: '#e53935', ttl: 30, subtypes: ['moderate', 'heavy', 'standstill'] },
  police: { icon: '👮', color: '#1e88e5', ttl: 60, subtypes: ['visible', 'hidden', 'roadblock'] },
  accident: { icon: '💥', color: '#8e24aa', ttl: 60, subtypes: ['minor', 'major'] },
  hazard: { icon: '⚠️', color: '#fb8c00', ttl: 120, subtypes: ['pothole', 'object', 'stopped_vehicle', 'animal', 'oil_spill'] },
  flood: { icon: '🌊', color: '#00897b', ttl: 360, subtypes: ['passable', 'impassable'] },
  closure: { icon: '⛔', color: '#424242', ttl: 720, subtypes: ['roadworks', 'event', 'landslide'] },
  camera: { icon: '📸', color: '#6d4c41', ttl: 60 * 24 * 30, subtypes: ['speed', 'red_light', 'awas'] },
};

// Potholes linger far longer than a stalled car.
export const SUBTYPE_TTL = { pothole: 60 * 24 * 7, landslide: 60 * 24 * 3, roadworks: 60 * 24 * 3 };

export function ttlMinutes(type, subtype) {
  return SUBTYPE_TTL[subtype] ?? REPORT_TYPES[type]?.ttl ?? 60;
}
