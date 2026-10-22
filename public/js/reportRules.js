// Report validation, merging and voting rules. Shared by the server's store
// and the app's on-device store, so both behave identically.
import { REPORT_TYPES, ttlMinutes } from './reportTypes.js';
import { inMalaysia, haversine } from './geo.js';

const MINUTE = 60_000;
// A matching report within this radius is treated as the same incident.
export const MERGE_RADIUS_M = 100;
const MAX_NOTE = 140;

export class ValidationError extends Error {}

// Validates raw input and returns clean report fields, or throws ValidationError.
export function normalizeReport({ type, subtype, lat, lng, note } = {}) {
  const def = REPORT_TYPES[type];
  if (!def) throw new ValidationError('Unknown report type');
  if (subtype != null && !def.subtypes.includes(subtype)) throw new ValidationError('Unknown subtype');
  lat = Number(lat);
  lng = Number(lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ValidationError('Invalid coordinates');
  if (!inMalaysia([lat, lng])) throw new ValidationError('Location is outside Malaysia');
  note = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE) : '';
  return { type, subtype: subtype ?? def.subtypes[0], lat, lng, note };
}

export function createReport(fields, id, now) {
  return { id, ...fields, createdAt: now, expiresAt: now + ttlMinutes(fields.type, fields.subtype) * MINUTE, up: 1, down: 0 };
}

// A second driver reporting the same thing confirms it rather than duplicating it.
export function findDuplicate(reports, { type, subtype, lat, lng }) {
  return reports.find((r) => r.type === type && r.subtype === subtype && haversine([r.lat, r.lng], [lat, lng]) <= MERGE_RADIUS_M);
}

// "Still there" extends the report's life; enough "not there" votes remove it.
// Mutates the report; returns true when it should be removed.
export function applyVote(r, stillThere, now) {
  if (stillThere) {
    r.up += 1;
    r.expiresAt = Math.max(r.expiresAt, now + ttlMinutes(r.type, r.subtype) * MINUTE);
    return false;
  }
  r.down += 1;
  return r.down >= 2 && r.down >= r.up;
}
