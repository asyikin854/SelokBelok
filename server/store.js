import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { REPORT_TYPES, ttlMinutes } from '../public/js/reportTypes.js';
import { inMalaysia, haversine } from '../public/js/geo.js';

const MINUTE = 60_000;
// A matching report within this radius is treated as the same incident.
const MERGE_RADIUS_M = 100;
const MAX_NOTE = 140;

export class ValidationError extends Error {}

// In-memory report store with optional JSON-file persistence. Emits
// 'added', 'updated' and 'removed' with the affected report.
export class ReportStore extends EventEmitter {
  constructor({ file = null, now = () => Date.now() } = {}) {
    super();
    this.file = file;
    this.now = now;
    this.reports = new Map();
    this.saveTimer = null;
  }

  async load() {
    if (!this.file) return;
    try {
      const list = JSON.parse(await readFile(this.file, 'utf8'));
      for (const r of list) this.reports.set(r.id, r);
      this.prune();
    } catch (err) {
      if (err.code !== 'ENOENT') console.warn(`Could not load ${this.file}: ${err.message}`);
    }
  }

  list({ bbox } = {}) {
    this.prune();
    const out = [...this.reports.values()];
    if (!bbox) return out;
    const [south, west, north, east] = bbox;
    return out.filter((r) => r.lat >= south && r.lat <= north && r.lng >= west && r.lng <= east);
  }

  get(id) {
    const r = this.reports.get(id);
    return r && r.expiresAt > this.now() ? r : undefined;
  }

  add({ type, subtype, lat, lng, note }) {
    const def = REPORT_TYPES[type];
    if (!def) throw new ValidationError('Unknown report type');
    if (subtype != null && !def.subtypes.includes(subtype)) throw new ValidationError('Unknown subtype');
    lat = Number(lat);
    lng = Number(lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ValidationError('Invalid coordinates');
    if (!inMalaysia([lat, lng])) throw new ValidationError('Location is outside Malaysia');
    note = typeof note === 'string' ? note.trim().slice(0, MAX_NOTE) : '';

    subtype = subtype ?? def.subtypes[0];
    const now = this.now();

    // A second driver reporting the same thing confirms it rather than duplicating it.
    const existing = this.list().find(
      (r) => r.type === type && r.subtype === subtype && haversine([r.lat, r.lng], [lat, lng]) <= MERGE_RADIUS_M,
    );
    if (existing) return { report: this.vote(existing.id, true), merged: true };

    const report = {
      id: randomUUID(),
      type,
      subtype,
      lat,
      lng,
      note,
      createdAt: now,
      expiresAt: now + ttlMinutes(type, subtype) * MINUTE,
      up: 1,
      down: 0,
    };
    this.reports.set(report.id, report);
    this.changed('added', report);
    return { report, merged: false };
  }

  // "Still there" extends the report's life; enough "not there" votes remove it.
  vote(id, stillThere) {
    const r = this.get(id);
    if (!r) return null;
    if (stillThere) {
      r.up += 1;
      const ttl = ttlMinutes(r.type, r.subtype) * MINUTE;
      r.expiresAt = Math.max(r.expiresAt, this.now() + ttl);
    } else {
      r.down += 1;
      if (r.down >= 2 && r.down >= r.up) {
        this.remove(id);
        return null;
      }
    }
    this.changed('updated', r);
    return r;
  }

  remove(id) {
    const r = this.reports.get(id);
    if (!r) return;
    this.reports.delete(id);
    this.changed('removed', r);
  }

  prune() {
    const now = this.now();
    for (const r of [...this.reports.values()]) if (r.expiresAt <= now) this.remove(r.id);
  }

  changed(event, report) {
    this.emit(event, report);
    this.scheduleSave();
  }

  scheduleSave() {
    if (!this.file || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save().catch((err) => console.warn(`Could not save reports: ${err.message}`));
    }, 1000);
    this.saveTimer.unref?.();
  }

  async save() {
    if (!this.file) return;
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify([...this.reports.values()]));
    await rename(tmp, this.file);
  }
}
