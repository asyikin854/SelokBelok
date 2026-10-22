// Builds the web bundle for the Android app into www/ and writes the
// Capacitor config. Usage:
//   API_URL=https://selokbelok.example.com node scripts/build-app.mjs
// Without API_URL the app runs without a server: search and routing call the
// public map services directly and reports stay on the device.
import { cp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WWW = join(ROOT, 'www');
const apiUrl = process.env.API_URL?.replace(/\/$/, '') || null;

await rm(WWW, { recursive: true, force: true });
await cp(join(ROOT, 'public'), WWW, { recursive: true });

// Bundle Leaflet so the app shell needs no CDN.
const leaflet = join(ROOT, 'node_modules', 'leaflet', 'dist');
await mkdir(join(WWW, 'vendor', 'leaflet'), { recursive: true });
for (const f of ['leaflet.js', 'leaflet.css', 'images']) await cp(join(leaflet, f), join(WWW, 'vendor', 'leaflet', f), { recursive: true });

const indexPath = join(WWW, 'index.html');
let html = await readFile(indexPath, 'utf8');
html = html
  .replace(/<link rel="stylesheet" href="https:\/\/unpkg\.com\/leaflet[^>]*>/s, '<link rel="stylesheet" href="/vendor/leaflet/leaflet.css" />')
  .replace(/<script src="https:\/\/unpkg\.com\/leaflet[^>]*><\/script>/s, '<script src="/vendor/leaflet/leaflet.js"></script>');
if (html.includes('unpkg.com')) throw new Error('Could not replace the Leaflet CDN tags in index.html');
await writeFile(indexPath, html);

const configPath = join(WWW, 'js', 'config.js');
const config = await readFile(configPath, 'utf8');
const patched = config.replace(/apiUrl: '[^']*',/, `apiUrl: ${JSON.stringify(apiUrl)},`);
if (patched === config && apiUrl !== '') throw new Error('Could not set apiUrl in config.js');
await writeFile(configPath, patched);

// A plain-http server (e.g. on your LAN while developing) needs cleartext allowed.
const cleartext = apiUrl?.startsWith('http://') ?? false;
const capConfig = {
  appId: 'my.selokbelok.app',
  appName: 'SelokBelok',
  webDir: 'www',
  server: { androidScheme: 'https', ...(cleartext && { cleartext: true }) },
  android: { ...(cleartext && { allowMixedContent: true }) },
};
await writeFile(join(ROOT, 'capacitor.config.json'), `${JSON.stringify(capConfig, null, 2)}\n`);

console.log(`Built www/ (${apiUrl ? `server: ${apiUrl}` : 'no server: reports stay on device'})`);
