import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBackend } from '../public/js/backend.js';

const KL = { lat: 3.139, lng: 101.6869 };

test('device backend: reports merge, persist in memory and vote out like the server', async () => {
  const b = createBackend({ apiUrl: null });
  assert.equal(b.shared, false);
  const events = [];
  b.subscribe({ open() {}, error() {}, added: (r) => events.push(['added', r.id]), updated: (r) => events.push(['updated', r.id]), removed: (r) => events.push(['removed', r.id]) });

  const first = await b.addReport({ type: 'jam', subtype: 'heavy', ...KL });
  assert.equal(first.merged, false);
  const again = await b.addReport({ type: 'jam', subtype: 'heavy', lat: KL.lat + 0.0002, lng: KL.lng });
  assert.equal(again.merged, true);
  assert.equal(again.report.up, 2);
  assert.equal((await b.listReports()).length, 1);

  await assert.rejects(b.addReport({ type: 'jam', lat: 51.5, lng: 0 }), /outside Malaysia/);

  const id = first.report.id;
  assert.equal((await b.vote(id, false)).removed, false);
  assert.equal((await b.vote(id, false)).removed, true);
  assert.equal((await b.listReports()).length, 0);
  assert.deepEqual(events.map((e) => e[0]), ['added', 'updated', 'updated', 'removed']);
});

test('device backend: routes come straight from OSRM and are parsed', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({
      code: 'Ok',
      routes: [{ distance: 1000, duration: 120, geometry: { coordinates: [[101.68, 3.13], [101.69, 3.14]] }, legs: [{ summary: 'Jalan Tun Razak', steps: [] }] }],
    }));
  });
  const [route] = await createBackend({ apiUrl: null }).route([3.13, 101.68], [3.14, 101.69]);
  assert.match(calls[0], /^https:\/\/router\.project-osrm\.org\/route\/v1\/driving\/101\.68,3\.13;101\.69,3\.14\?/);
  assert.deepEqual(route.coords, [[3.13, 101.68], [3.14, 101.69]]);
  assert.equal(route.summary, 'Jalan Tun Razak');
});

test('server backend: talks to the configured API URL', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push([url, opts?.method ?? 'GET', opts?.body]);
    return new Response(JSON.stringify({ report: { id: 'x' }, merged: false }), { status: 201 });
  });
  const b = createBackend({ apiUrl: 'https://api.example.my/' });
  assert.equal(b.shared, true);
  await b.addReport({ type: 'police', ...KL });
  assert.equal(calls[0][0], 'https://api.example.my/api/reports');
  assert.equal(calls[0][1], 'POST');
  assert.equal(JSON.parse(calls[0][2]).type, 'police');
});
