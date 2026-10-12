import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes sw.js next to index.html: precaches every built file (app, geodata, flags) so the app works offline.
 * The OCR engine and language data (~11 MB) are cached on first use instead of on install.
 * Cache names start with "mw-" and the worker only ever deletes its own caches: other apps live on the same origin.
 */
function offlineWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'myworld-offline-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else if (name !== 'sw.js') files.push(relative(outDir, full).split('\\').join('/'));
        }
      };
      walk(outDir);
      // OCR (~10 MB) and per-country region maps are fetched when first needed and cached then.
      const precache = files.filter((f) => !f.startsWith('ocr/') && !f.startsWith('data/regions/'));
      // Each file is cached under "path?h=<content hash>": an update downloads only files that really changed
      // (city catalog, borders and flags — ~15 MB — are copied from the previous cache instead of refetched over LTE).
      const hashed = precache.map((f) => `${f}?h=${createHash('sha1').update(readFileSync(join(outDir, f))).digest('hex').slice(0, 10)}`);
      const version = createHash('sha1').update(hashed.join()).digest('hex').slice(0, 10);
      const sw = `const CACHE = 'mw-${version}';
const FILES = ${JSON.stringify(['./', ...hashed])};
async function fill(c, f) {
  if (f.includes('?h=')) {
    const old = await caches.match(f);
    if (old) return c.put(f, old);
  }
  const r = await fetch(new Request(f.split('?')[0], { cache: 'reload' }));
  if (!r.ok) throw new Error(f);
  return c.put(f, r);
}
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => fill(c, f)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('mw-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  e.respondWith(caches.open(CACHE).then((c) => c.match(e.request, { ignoreSearch: true, ignoreVary: true }).then((hit) => {
    if (hit) return hit;
    return fetch(e.request).then((r) => {
      if (r.ok && (url.pathname.includes('/ocr/') || url.pathname.includes('/data/regions/'))) c.put(e.request, r.clone());
      return r;
    }).catch(() => (e.request.mode === 'navigate' ? c.match('./') : Response.error()));
  })));
});
`;
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

// base './' keeps the build working from any sub-path, e.g. GitHub Pages /myworld/.
export default defineConfig({
  base: './',
  plugins: [react(), offlineWorker()],
  build: { chunkSizeWarningLimit: 1200 },
  // Module workers can lazy-load chunks (the photo scanner loads its EXIF reader on demand).
  worker: { format: 'es' },
  server: { port: 5174 },
});
