// Shared helpers for the catalog builders (resorts.mjs, spots.mjs). Run in GitHub Actions — the sandbox has no access to these sites.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoBounds, geoContains } from 'd3-geo';

export const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/** Output folder: checkout of the `data` branch + "/catalog" (CATALOG_DIR). */
export const OUT = process.env.CATALOG_DIR ?? join(process.cwd(), 'feed-data', 'catalog');
export const UA = 'MyWorldCatalog/1.0 (+https://tsaga7.github.io/myworld/)';

export const readJson = (path, fallback = null) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
};
export const writeOut = (name, data) => {
  const p = join(OUT, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(data)}\n`);
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function getJson(url, init = {}, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, { ...init, headers: { 'user-agent': UA, accept: 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(180_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url.slice(0, 80)}`);
      return await r.json();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(5000 * i);
    }
  }
}

const countries = readJson(join(APP, 'src/data/countries.json'));
export const COUNTRY_IDS = new Set(countries.map((c) => c.id));
export const countryContinent = new Map(countries.map((c) => [c.id, c.continent]));
const shapes = readJson(join(APP, 'public/data/countries.geojson')).features.map((f) => ({ f, b: geoBounds(f) }));
const inB = ([[w, s], [e, n]], lon, lat) => lat >= s - 0.1 && lat <= n + 0.1 && (w <= e ? lon >= w - 0.1 && lon <= e + 0.1 : lon >= w - 0.1 || lon <= e + 0.1);
export const countryAt = (lon, lat) => shapes.find(({ f, b }) => inB(b, lon, lat) && geoContains(f, [lon, lat]))?.f.properties.id ?? null;

/** Russian region name from the app's own region polygons (public/data/regions/<country>.json). */
const regionCache = new Map();
export function regionAt(countryId, lon, lat) {
  if (!regionCache.has(countryId)) {
    const fc = readJson(join(APP, 'public/data/regions', `${countryId}.json`));
    regionCache.set(countryId, fc ? fc.features.map((f) => ({ f, b: geoBounds(f) })) : []);
  }
  const hit = regionCache.get(countryId).find(({ f, b }) => inB(b, lon, lat) && geoContains(f, [lon, lat]));
  return hit ? hit.f.properties.ru || hit.f.properties.en || null : null;
}

export const round = (n, d = 0) => (typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null);
export const slug = (s) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9а-яё]+/g, '-')
    .replace(/^-|-$/g, '');
