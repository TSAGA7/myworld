import { geoBounds, geoContains, geoDistance } from 'd3-geo';
import { photoDay, type PhotoPoint, type ResolvedPoint, validPoint } from '../domain/photoPlaces';
import type { CatalogCity } from '../domain/search';
import { loadCatalog } from './catalog';
import { type CountryFeature, loadCountryShapes } from './geometry';
import { COUNTRY_BY_ID } from './reference';

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

const RADIUS = 30; // km: farther than this from any settlement → country only
const CELL = 0.5; // degrees
const EARTH = 6371;
const cellKey = (lat: number, lon: number) => `${Math.floor(lat / CELL)}:${Math.floor(lon / CELL)}`;

export interface PhotoResolver {
  resolve(p: PhotoPoint): ResolvedPoint | null;
  city(id: string): CatalogCity | undefined;
}

/**
 * Turns photo points into countries (Natural Earth borders) and the settlement nearby (GeoNames, 500+ people).
 * Bigger places win over tiny neighbours a little closer, so a photo in a suburb lands on the city.
 */
export async function loadPhotoResolver(): Promise<PhotoResolver> {
  const [shapes, catalog] = await Promise.all([loadCountryShapes(), loadCatalog()]);
  const boxes = shapes.features.map((f) => ({ f, b: geoBounds(f) }));
  const grid = new Map<string, CatalogCity[]>();
  for (const c of catalog.list) {
    const k = cellKey(c.lat, c.lon);
    const arr = grid.get(k);
    if (arr) arr.push(c);
    else grid.set(k, [c]);
  }

  const inBox = ({ b: [[w, s], [e, n]] }: { b: [[number, number], [number, number]] }, lon: number, lat: number) =>
    lat >= s - 0.2 && lat <= n + 0.2 && (w <= e ? lon >= w - 0.2 && lon <= e + 0.2 : lon >= w - 0.2 || lon <= e + 0.2);

  const byId = new Map(boxes.map((x) => [x.f.properties.id, x]));
  const countryOf = (lon: number, lat: number, guess: string | null): string | null => {
    const p: [number, number] = [lon, lat];
    // Usually the nearest settlement's country is right: one polygon test instead of a scan.
    const g = guess ? byId.get(guess) : undefined;
    if (g && geoContains(g.f as CountryFeature, p)) return guess;
    for (const x of boxes) if (inBox(x, lon, lat) && geoContains(x.f as CountryFeature, p)) return x.f.properties.id;
    return null;
  };

  const nearest = (lat: number, lon: number, countryId: string | null): CatalogCity | null => {
    let best: CatalogCity | null = null;
    let bestScore = Infinity;
    const r = Math.floor(lat / CELL);
    const q = Math.floor(lon / CELL);
    for (let i = r - 1; i <= r + 1; i++)
      for (let j = q - 1; j <= q + 1; j++) {
        const jj = j < -180 / CELL ? j + 360 / CELL : j >= 180 / CELL ? j - 360 / CELL : j; // wrap at 180°
        for (const c of grid.get(`${i}:${jj}`) ?? []) {
          if (countryId && c.countryId !== countryId) continue;
          const d = geoDistance([lon, lat], [c.lon, c.lat]) * EARTH;
          if (d > RADIUS) continue;
          const score = (d + 1) / Math.pow(Math.max(c.pop, 500) + (c.capital ? 5e6 : 0), 0.2);
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
    city: (id) => catalog.byId.get(id),
    resolve(p) {
      // Photos within ~1 km share one lookup: a holiday of 2 000 photos is a few dozen spots.
      const k = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
      let hit = cache.get(k);
      if (hit === undefined) {
        const country = countryOf(p.lon, p.lat, nearest(p.lat, p.lon, null)?.countryId ?? null);
        const city = nearest(p.lat, p.lon, country);
        const countryId = country ?? city?.countryId ?? null;
        hit = countryId && COUNTRY_BY_ID.has(countryId) ? { countryId, cityId: city?.countryId === countryId ? city.id : null } : null;
        cache.set(k, hit);
      }
      return hit ? { ...p, ...hit } : null;
    },
  };
}
