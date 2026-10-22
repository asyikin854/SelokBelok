import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReportStore, ValidationError } from '../server/store.js';

const KL = { lat: 3.139, lng: 101.6869 };

function clockStore(opts) {
  let now = 1_700_000_000_000;
  const store = new ReportStore({ ...opts, now: () => now });
  return { store, advance: (min) => (now += min * 60_000) };
}

test('rejects unknown types, bad subtypes and locations outside Malaysia', () => {
  const { store } = clockStore();
  assert.throws(() => store.add({ type: 'ufo', ...KL }), ValidationError);
  assert.throws(() => store.add({ type: 'jam', subtype: 'nope', ...KL }), ValidationError);
  assert.throws(() => store.add({ type: 'jam', lat: 13.75, lng: 100.5 }), ValidationError);
  assert.throws(() => store.add({ type: 'jam', lat: 'x', lng: 1 }), ValidationError);
});

test('defaults the subtype and trims long notes', () => {
  const { store } = clockStore();
  const { report } = store.add({ type: 'police', ...KL, note: `  ${'a'.repeat(300)}  ` });
  assert.equal(report.subtype, 'visible');
  assert.equal(report.note.length, 140);
});

test('a duplicate nearby report confirms the existing one instead of adding', () => {
  const { store } = clockStore();
  const first = store.add({ type: 'jam', subtype: 'heavy', ...KL }).report;
  const second = store.add({ type: 'jam', subtype: 'heavy', lat: KL.lat + 0.0003, lng: KL.lng });
  assert.equal(second.merged, true);
  assert.equal(second.report.id, first.id);
  assert.equal(second.report.up, 2);
  assert.equal(store.list().length, 1);
  // Different subtype is a different incident.
  assert.equal(store.add({ type: 'jam', subtype: 'standstill', ...KL }).merged, false);
});

test('reports expire after their TTL, and confirming extends them', () => {
  const { store, advance } = clockStore();
  const jam = store.add({ type: 'jam', ...KL }).report; // 30 min
  const pothole = store.add({ type: 'hazard', subtype: 'pothole', ...KL }).report; // 7 days
  advance(20);
  store.vote(jam.id, true);
  advance(20);
  assert.ok(store.get(jam.id), 'confirmed jam survives past original TTL');
  advance(31);
  assert.equal(store.get(jam.id), undefined);
  assert.ok(store.get(pothole.id));
});

test('enough "not there" votes remove a report and emit removed', () => {
  const { store } = clockStore();
  const removed = [];
  store.on('removed', (r) => removed.push(r.id));
  const r = store.add({ type: 'accident', ...KL }).report;
  assert.ok(store.vote(r.id, false));
  assert.equal(store.vote(r.id, false), null);
  assert.deepEqual(removed, [r.id]);
});

test('bbox filtering', () => {
  const { store } = clockStore();
  store.add({ type: 'flood', ...KL });
  store.add({ type: 'flood', lat: 5.98, lng: 116.07 });
  assert.equal(store.list({ bbox: [2, 100, 4, 103] }).length, 1);
});

test('persists to disk and reloads', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'selokbelok-'));
  try {
    const file = join(dir, 'reports.json');
    const a = new ReportStore({ file });
    a.add({ type: 'camera', subtype: 'awas', ...KL });
    clearTimeout(a.saveTimer);
    await a.save();
    const b = new ReportStore({ file });
    await b.load();
    assert.equal(b.list()[0].subtype, 'awas');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
