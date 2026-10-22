import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversine, inMalaysia, nearestOnPolyline, reportsOnRoute, rankRoutes, reportPenalty } from '../public/js/geo.js';

// A straight east-west line through KL, roughly 2.2 km long.
const line = [[3.14, 101.68], [3.14, 101.69], [3.14, 101.70]];

test('haversine matches a known distance (KLCC to KL Sentral ≈ 3.9 km)', () => {
  const d = haversine([3.1579, 101.7116], [3.1340, 101.6865]);
  assert.ok(d > 3700 && d < 4000, `got ${d}`);
});

test('inMalaysia covers peninsular and East Malaysia but not Bangkok', () => {
  assert.ok(inMalaysia([3.139, 101.6869])); // KL
  assert.ok(inMalaysia([5.98, 116.07])); // Kota Kinabalu
  assert.ok(inMalaysia([1.55, 110.34])); // Kuching
  assert.ok(!inMalaysia([13.75, 100.5])); // Bangkok
});

test('nearestOnPolyline reports perpendicular distance and progress along the line', () => {
  const r = nearestOnPolyline([3.1405, 101.695], line);
  assert.ok(Math.abs(r.distance - 55.6) < 2, `distance ${r.distance}`);
  assert.equal(r.index, 1);
  assert.ok(Math.abs(r.along - 1666) < 10, `along ${r.along}`);
});

test('reportsOnRoute keeps nearby reports in route order and drops far ones', () => {
  const reports = [
    { id: 'far', type: 'jam', lat: 3.15, lng: 101.69 },
    { id: 'b', type: 'police', lat: 3.1401, lng: 101.698 },
    { id: 'a', type: 'jam', lat: 3.1399, lng: 101.682 },
  ];
  assert.deepEqual(reportsOnRoute(reports, line).map((x) => x.report.id), ['a', 'b']);
});

test('reportPenalty: police costs nothing, closures cost a lot, unknown subtypes fall back', () => {
  assert.equal(reportPenalty({ type: 'police', subtype: 'roadblock' }), 0);
  assert.equal(reportPenalty({ type: 'jam', subtype: 'standstill' }), 720);
  assert.equal(reportPenalty({ type: 'hazard', subtype: 'pothole' }), 30);
  assert.ok(reportPenalty({ type: 'closure', subtype: 'roadworks' }) >= 3600);
});

test('rankRoutes prefers a slightly slower route that avoids a standstill jam', () => {
  const fastButJammed = { id: 1, duration: 600, coords: line };
  const detour = { id: 2, duration: 800, coords: [[3.15, 101.68], [3.15, 101.70]] };
  const ranked = rankRoutes([fastButJammed, detour], [{ type: 'jam', subtype: 'standstill', lat: 3.14, lng: 101.685 }]);
  assert.deepEqual(ranked.map((r) => r.id), [2, 1]);
  assert.equal(ranked[1].incidents.length, 1);
});
