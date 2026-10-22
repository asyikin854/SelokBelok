import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ValidationError, normalizeReport, createReport, findDuplicate, applyVote } from '../public/js/reportRules.js';

export { ValidationError };

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

  add(input) {
    const fields = normalizeReport(input);
    const existing = findDuplicate(this.list(), fields);
    if (existing) return { report: this.vote(existing.id, true), merged: true };

    const report = createReport(fields, randomUUID(), this.now());
    this.reports.set(report.id, report);
    this.changed('added', report);
    return { report, merged: false };
  }

  vote(id, stillThere) {
    const r = this.get(id);
    if (!r) return null;
    if (applyVote(r, stillThere, this.now())) {
      this.remove(id);
      return null;
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
