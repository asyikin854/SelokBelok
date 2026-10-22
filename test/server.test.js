import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.js';

let server, base;
before(async () => {
  server = createApp();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => {
  server.closeAllConnections();
  server.close();
});

const post = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('serves the app shell', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /SelokBelok/);
  assert.equal((await fetch(base + '/../package.json')).status, 200); // resolves inside public/, SPA fallback
});

test('create, list, vote and validation round-trip', async () => {
  let res = await post('/api/reports', { type: 'police', subtype: 'roadblock', lat: 3.1, lng: 101.6 });
  assert.equal(res.status, 201);
  const { report } = await res.json();

  const list = await (await fetch(`${base}/api/reports`)).json();
  assert.ok(list.some((r) => r.id === report.id));

  res = await post(`/api/reports/${report.id}/vote`, { stillThere: true });
  assert.equal((await res.json()).report.up, 2);

  assert.equal((await post('/api/reports', { type: 'police', lat: 51.5, lng: 0 })).status, 400);
  assert.equal((await post('/api/reports', null)).status, 400);
  assert.equal((await post('/api/reports/nope/vote', {})).status, 404);
});

test('streams new reports over SSE', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${base}/api/stream`, { signal: ctrl.signal });
  const reader = res.body.getReader();
  await reader.read(); // retry preamble
  await post('/api/reports', { type: 'flood', lat: 6.12, lng: 102.24 });
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /event: added/);
  assert.match(text, /"type":"flood"/);
  ctrl.abort();
});
