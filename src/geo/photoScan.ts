import type { ResolvedPoint } from '../domain/photoPlaces';
import type { CountryShapes } from './geometry';
import { buildPhotoIndex, type FoundPlace, type PhotoIndex, readPhoto } from './photoGeo';
import { COUNTRY_BY_ID } from './reference';

export interface ScanProgress {
  done: number;
  total: number;
  located: number;
  /** Countries found so far, in the order they turned up. */
  countries: string[];
}

export interface ScanResult {
  points: ResolvedPoint[];
  located: number;
  places: FoundPlace[];
}

/** `base` is the absolute app URL (a worker resolves relative paths against its own script, not the page). */
let index: Promise<PhotoIndex> | null = null;
export function loadPhotoIndex(base: string): Promise<PhotoIndex> {
  if (!index) {
    const get = (path: string) =>
      fetch(new URL(path, base)).then((r) => {
        if (!r.ok) throw new Error(`Не загрузился справочник (${path}, ${r.status})`);
        return r;
      });
    index = Promise.all([
      get('data/cities.tsv').then((r) => r.text()),
      get('data/countries.geojson').then((r) => r.json() as Promise<CountryShapes>),
      get('data/region-names.json')
        .then((r) => r.json() as Promise<Record<string, string>>)
        .catch(() => ({})),
    ]).then(([tsv, shapes, regions]) => buildPhotoIndex(tsv, shapes, regions, new Set(COUNTRY_BY_ID.keys())));
    index.catch(() => (index = null));
  }
  return index;
}

const PARALLEL = 6;

/** Reads and places every photo; reports progress about 10 times a second. */
export async function scanPhotos(files: ReadonlyArray<Blob | Uint8Array>, today: string, base: string, onProgress: (p: ScanProgress) => void): Promise<ScanResult> {
  const idx = await loadPhotoIndex(base);
  const points: ResolvedPoint[] = [];
  const countries: string[] = [];
  const places = new Map<string, FoundPlace>();
  let located = 0;
  let done = 0;
  let next = 0;
  let last = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - last < 100) return;
    last = now;
    onProgress({ done, total: files.length, located, countries: [...countries] });
  };
  report(true);
  const worker = async () => {
    while (next < files.length) {
      const f = files[next++];
      if (!f) break;
      const p = await readPhoto(f, today);
      if (p) {
        located++;
        const r = idx.resolve(p);
        if (r) {
          points.push(r);
          if (!countries.includes(r.countryId)) countries.push(r.countryId);
          const place = r.cityId ? idx.place(r.cityId) : undefined;
          if (place) places.set(place.id, place);
        }
      }
      done++;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, files.length) }, worker));
  report(true);
  return { points, located, places: [...places.values()] };
}
