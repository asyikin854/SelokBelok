import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReportStore, ValidationError } from './store.js';
import { geocode, reverseGeocode, route, ProviderError } from './providers.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PUBLIC = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const MAX_BODY = 4096;
// Per-client limit on new reports and votes, to blunt spam.
const WRITE_LIMIT = { tokens: 20, perMs: 60_000 };

export function createApp({ store = new ReportStore() } = {}) {
  const streams = new Set();
  const buckets = new Map();

  for (const event of ['added', 'updated', 'removed']) {
    store.on(event, (report) => {
      const msg = `event: ${event}\ndata: ${JSON.stringify(report)}\n\n`;
      for (const res of streams) res.write(msg);
    });
  }

  const pruneTimer = setInterval(() => store.prune(), 30_000);
  const heartbeat = setInterval(() => {
    for (const res of streams) res.write(': ping\n\n');
  }, 25_000);
  pruneTimer.unref();
  heartbeat.unref();

  function allowWrite(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const now = Date.now();
    const b = buckets.get(ip) ?? { tokens: WRITE_LIMIT.tokens, at: now };
    b.tokens = Math.min(WRITE_LIMIT.tokens, b.tokens + ((now - b.at) / WRITE_LIMIT.perMs) * WRITE_LIMIT.tokens);
    b.at = now;
    buckets.set(ip, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  async function handleApi(req, res, url) {
    const path = url.pathname;
    const q = url.searchParams;

    if (req.method === 'GET' && path === '/api/health') return json(res, 200, { ok: true, reports: store.reports.size });

    if (req.method === 'GET' && path === '/api/reports') {
      const bbox = q.get('bbox')?.split(',').map(Number);
      const valid = bbox?.length === 4 && bbox.every(Number.isFinite);
      return json(res, 200, store.list({ bbox: valid ? bbox : undefined }));
    }

    if (req.method === 'POST' && path === '/api/reports') {
      if (!allowWrite(req)) return json(res, 429, { error: 'Too many reports, slow down' });
      const { report, merged } = store.add(await readBody(req));
      return json(res, merged ? 200 : 201, { report, merged });
    }

    const vote = path.match(/^\/api\/reports\/([\w-]+)\/vote$/);
    if (req.method === 'POST' && vote) {
      if (!allowWrite(req)) return json(res, 429, { error: 'Too many votes, slow down' });
      if (!store.get(vote[1])) return json(res, 404, { error: 'Report not found' });
      const body = await readBody(req);
      const report = store.vote(vote[1], body.stillThere !== false);
      return json(res, 200, { report, removed: !report });
    }

    if (req.method === 'GET' && path === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return;
    }

    if (req.method === 'GET' && path === '/api/geocode') {
      const near = parsePoint(q.get('near'));
      return json(res, 200, await geocode(q.get('q'), near));
    }

    if (req.method === 'GET' && path === '/api/reverse') {
      const p = parsePoint(q.get('at'));
      if (!p) throw new ValidationError('at=lat,lng is required');
      return json(res, 200, await reverseGeocode(p));
    }

    if (req.method === 'GET' && path === '/api/route') {
      const from = parsePoint(q.get('from'));
      const to = parsePoint(q.get('to'));
      if (!from || !to) throw new ValidationError('from=lat,lng and to=lat,lng are required');
      return json(res, 200, await route(from, to));
    }

    json(res, 404, { error: 'Not found' });
  }

  async function serveStatic(req, res, url) {
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    if (rel.startsWith('..')) return json(res, 400, { error: 'Bad path' });
    let file = join(PUBLIC, rel || 'index.html');
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      file = join(PUBLIC, 'index.html'); // SPA fallback
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      json(res, 404, { error: 'Not found' });
    }
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else if (req.method === 'GET' || req.method === 'HEAD') await serveStatic(req, res, url);
      else json(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      if (err instanceof ValidationError) return json(res, 400, { error: err.message });
      if (err instanceof ProviderError) return json(res, err.status, { error: err.message });
      console.error(err);
      json(res, 500, { error: 'Internal error' });
    }
  });

  server.on('close', () => {
    clearInterval(pruneTimer);
    clearInterval(heartbeat);
    for (const res of streams) res.end();
  });
  return server;
}

function json(res, status, body) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parsePoint(s) {
  const p = s?.split(',').map(Number);
  return p?.length === 2 && p.every(Number.isFinite) ? p : null;
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new ValidationError('Body too large');
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new ValidationError('Invalid JSON');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ValidationError('Expected a JSON object');
  return body;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const store = new ReportStore({ file: process.env.DATA_FILE || join(ROOT, 'data', 'reports.json') });
  await store.load();
  const port = Number(process.env.PORT) || 3000;
  createApp({ store }).listen(port, () => console.log(`SelokBelok running at http://localhost:${port}`));
  const shutdown = async () => {
    await store.save();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
