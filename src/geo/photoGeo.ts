import { geoBounds, geoContains, geoDistance } from 'd3-geo';
import { photoDay, type PhotoPoint, type ResolvedPoint, validPoint } from '../domain/photoPlaces';
import type { CountryShapes } from './geometry';

type Exifr = typeof import('exifr').default;
let exifr: Promise<Exifr> | null = null;
// The lite build reads JPEG and HEIC (iPhone) headers only; it is loaded on first use.
const loadExifr = (): Promise<Exifr> => (exifr ??= import('exifr/dist/lite.esm.mjs').then((m) => m.default));

/**
 * Place and day of one photo from its EXIF. Only the file header is read, so thousands of photos take seconds.
 * Null when the photo has no location (screenshots, downloads, or location removed by the phone).
 */
export async function readPhoto(file: Blob | Uint8Array, today: string): Promise<PhotoPoint | null> {
  try {
    const x = await (await loadExifr()).parse(file, { ifd1: false, interop: false, xmp: false, icc: false, iptc: false, jfif: false });
    if (!x || !validPoint(x.latitude, x.longitude)) return null;
    return { lat: x.latitude as number, lon: x.longitude as number, date: photoDay(x.DateTimeOriginal ?? x.CreateDate, today) };
  } catch {
    return null;
  }
}

/** A settlement found for a photo — enough to save it as a catalog city. */
export interface FoundPlace {
  id: string;
  ru: string;
  en: string;
  countryId: string;
  lat: number;
  lon: number;
  region: string;
}

/** Lookup of photo points. `cityId` in the result is the row of the city in cities.tsv (names are read later). */
export interface PhotoIndex {
  resolve(p: PhotoPoint): ResolvedPoint | null;
}

const MAGIC = 0x3150574d;
const RADIUS = 30; // km: farther than this from any settlement → country only
const CELL = 0.5; // degrees
const COLS = 360 / CELL;
const EARTH = 6371;
const cell = (lat: number, lon: number) => {
  const c = Math.floor(lon / CELL);
  return Math.floor(lat / CELL) * 10_000 + (c < -COLS / 2 ? c + COLS : c >= COLS / 2 ? c - COLS : c);
};

/** Reads photo-index.bin (see scripts/photo-index.mjs) and the country borders into a lookup. */
export function buildPhotoIndex(bin: ArrayBuffer, shapes: CountryShapes, knownCountries: ReadonlySet<string>): PhotoIndex {
  const dv = new DataView(bin);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('Справочник городов повреждён — обновите страницу');
  const count = dv.getUint32(4, true);
  const headLen = dv.getUint32(8, true);
  const { countries: countryIds } = JSON.parse(new TextDecoder().decode(new Uint8Array(bin, 12, headLen))) as { countries: string[] };
  let o = 12 + headLen;
  const lat = new Float32Array(bin, o, count);
  const lon = new Float32Array(bin, (o += count * 4), count);
  const weight = new Float32Array(bin, (o += count * 4), count);
  const country = new Uint16Array(bin, (o += count * 4), count);
  const countryIdx = new Map(countryIds.map((id, i) => [id, i]));

  const grid = new Map<number, number[]>();
  for (let i = 0; i < count; i++) {
    if (country[i] === 0xffff) continue;
    const k = cell(lat[i] ?? 0, lon[i] ?? 0);
    const arr = grid.get(k);
    if (arr) arr.push(i);
    else grid.set(k, [i]);
  }

  const boxes = shapes.features.map((f) => ({ f, b: geoBounds(f) }));
  const byId = new Map(boxes.map((x) => [x.f.properties.id, x]));
  const inBox = ([[w, s], [e, n]]: [[number, number], [number, number]], x: number, y: number) =>
    y >= s - 0.2 && y <= n + 0.2 && (w <= e ? x >= w - 0.2 && x <= e + 0.2 : x >= w - 0.2 || x <= e + 0.2);
  const countryOf = (x: number, y: number, guess: string | null): string | null => {
    const p: [number, number] = [x, y];
    // Usually the nearest settlement's country is right: one polygon test instead of a scan.
    const g = guess ? byId.get(guess) : undefined;
    if (g && geoContains(g.f, p)) return guess;
    for (const b of boxes) if (b !== g && inBox(b.b, x, y) && geoContains(b.f, p)) return b.f.properties.id;
    return null;
  };

  const nearest = (y: number, x: number, only: number | null): number => {
    let best = -1;
    let bestScore = Infinity;
    const r = Math.floor(y / CELL);
    const q = Math.floor(x / CELL);
    for (let i = r - 1; i <= r + 1; i++)
      for (let j = q - 1; j <= q + 1; j++) {
        for (const c of grid.get(cell(i * CELL + CELL / 2, j * CELL + CELL / 2)) ?? []) {
          if (only !== null && country[c] !== only) continue;
          const d = geoDistance([x, y], [lon[c] ?? 0, lat[c] ?? 0]) * EARTH;
          if (d > RADIUS) continue;
          const score = (d + 1) / (weight[c] || 1);
          if (score < bestScore) {
            bestScore = score;
            best = c;
          }
        }
      }
    return best;
  };

  const cache = new Map<string, { countryId: string; cityId: string | null } | null>();
  return {
    resolve(p) {
      // Photos within ~1 km share one lookup: a holiday of 2 000 photos is a few dozen spots.
      const k = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
      let hit = cache.get(k);
      if (hit === undefined) {
        const any = nearest(p.lat, p.lon, null);
        const guess = any >= 0 ? (countryIds[country[any] ?? 0] ?? null) : null;
        const countryId = countryOf(p.lon, p.lat, guess) ?? guess;
        const ci = countryId ? countryIdx.get(countryId) : undefined;
        const c = ci === undefined ? -1 : nearest(p.lat, p.lon, ci);
        hit = countryId && knownCountries.has(countryId) ? { countryId, cityId: c >= 0 ? String(c) : null } : null;
        cache.set(k, hit);
      }
      return hit ? { ...p, ...hit } : null;
    },
  };
}

/**
 * Reads the given lines of cities.tsv while it streams in, without keeping the whole file:
 * names of the few dozen places found, out of ~194 000.
 */
export async function readCatalogRows(
  body: ReadableStream<Uint8Array> | null,
  rows: ReadonlySet<number>,
  regionNames: Record<string, string>,
): Promise<Map<number, FoundPlace>> {
  const out = new Map<number, FoundPlace>();
  if (!body || rows.size === 0) return out;
  const max = Math.max(...rows);
  const reader = body.getReader();
  const dec = new TextDecoder();
  let rest = '';
  let line = 0;
  const take = (text: string) => {
    if (!rows.has(line)) return;
    const [id = '', ru = '', en = '', countryId = '', y = '', x = '', , regionId = ''] = text.split('\t');
    if (id && ru && countryId) out.set(line, { id, ru, en: en || ru, countryId, lat: Number(y), lon: Number(x), region: regionNames[regionId] ?? '' });
  };
  for (;;) {
    const { done, value } = await reader.read();
    const text = rest + (done ? dec.decode() : dec.decode(value, { stream: true }));
    let start = 0;
    for (let n = text.indexOf('\n'); n >= 0; n = text.indexOf('\n', start)) {
      take(text.slice(start, n));
      start = n + 1;
      if (++line > max) {
        await reader.cancel().catch(() => undefined);
        return out;
      }
    }
    rest = text.slice(start);
    if (done) {
      if (rest) take(rest);
      return out;
    }
  }
}
