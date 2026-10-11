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

export interface PhotoIndex {
  resolve(p: PhotoPoint): ResolvedPoint | null;
  place(id: string): FoundPlace | undefined;
}

const RADIUS = 30; // km: farther than this from any settlement → country only
const CELL = 0.5; // degrees
const COLS = 360 / CELL;
const EARTH = 6371;
const cell = (lat: number, lon: number) => {
  const c = Math.floor(lon / CELL);
  return Math.floor(lat / CELL) * 10_000 + (c < -COLS / 2 ? c + COLS : c >= COLS / 2 ? c - COLS : c);
};

/**
 * Compact index of the city catalog (cities.tsv) and country borders for photo lookups. Numbers live in typed
 * arrays and a row's text is decoded only for the places actually found, so it stays light on a phone
 * (the search catalog keeps ~194 000 objects; this keeps a few arrays).
 */
export function buildPhotoIndex(tsv: string, shapes: CountryShapes, regionNames: Record<string, string>, knownCountries: ReadonlySet<string>): PhotoIndex {
  const starts: number[] = [];
  for (let i = 0; i < tsv.length; ) {
    starts.push(i);
    const n = tsv.indexOf('\n', i);
    if (n < 0) break;
    i = n + 1;
  }
  const count = starts.length;
  const lat = new Float32Array(count);
  const lon = new Float32Array(count);
  const weight = new Float32Array(count);
  const country = new Uint16Array(count);
  const countryIds: string[] = [];
  const countryIdx = new Map<string, number>();
  const grid = new Map<number, number[]>();
  const rowText = (i: number) => tsv.slice(starts[i] ?? 0, (starts[i + 1] ?? tsv.length + 1) - 1);
  for (let i = 0; i < count; i++) {
    const f = rowText(i).split('\t');
    const cid = f[3];
    if (!f[0] || !f[1] || !cid) {
      weight[i] = 0;
      continue;
    }
    let ci = countryIdx.get(cid);
    if (ci === undefined) {
      ci = countryIds.push(cid) - 1;
      countryIdx.set(cid, ci);
    }
    country[i] = ci;
    lat[i] = Number(f[4]);
    lon[i] = Number(f[5]);
    // Bigger places win over tiny neighbours a little closer, so a photo in a suburb lands on the city.
    weight[i] = Math.pow(Math.max(Number(f[6]) || 0, 500) + (f[8] === '1' ? 5e6 : 0), 0.2);
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

  const found = new Map<string, FoundPlace>();
  const cache = new Map<string, { countryId: string; cityId: string | null } | null>();
  return {
    place: (id) => found.get(id),
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
        hit = null;
        if (countryId && knownCountries.has(countryId)) {
          let cityId: string | null = null;
          if (c >= 0) {
            const [id = '', ru = '', en = '', , y = '', x = '', , regionId = ''] = rowText(c).split('\t');
            cityId = id;
            if (!found.has(id)) found.set(id, { id, ru, en: en || ru, countryId, lat: Number(y), lon: Number(x), region: regionNames[regionId] ?? '' });
          }
          hit = { countryId, cityId };
        }
        cache.set(k, hit);
      }
      return hit ? { ...p, ...hit } : null;
    },
  };
}
