import type { ResolvedPoint } from '../domain/photoPlaces';
import type { CountryShapes } from './geometry';
import { buildPhotoIndex, type PhotoIndex, readPhoto } from './photoGeo';
import { COUNTRY_BY_ID } from './reference';

export interface ScanProgress {
  done: number;
  total: number;
  located: number;
  /** Countries found so far, in the order they turned up. */
  countries: string[];
}

/** Points carry the catalog row of their city as `cityId` until the names are read (photoClient). */
export interface RawScan {
  points: ResolvedPoint[];
  located: number;
}

/** The two files the lookup needs, as raw bytes so they can be handed to a worker without copying. */
export interface IndexData {
  bin: ArrayBuffer;
  shapes: ArrayBuffer;
}

export const makeIndex = (d: IndexData): PhotoIndex =>
  buildPhotoIndex(d.bin, JSON.parse(new TextDecoder().decode(d.shapes)) as CountryShapes, new Set(COUNTRY_BY_ID.keys()));

const PARALLEL = 6;

/** Reads and places every photo; reports progress about 15 times a second. */
export async function scanPhotos(
  idx: PhotoIndex,
  files: ReadonlyArray<Blob | Uint8Array>,
  today: string,
  onProgress: (p: ScanProgress) => void,
): Promise<RawScan> {
  const points: ResolvedPoint[] = [];
  const countries: string[] = [];
  let located = 0;
  let done = 0;
  let next = 0;
  let last = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - last < 66) return;
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
        }
      }
      done++;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, files.length) }, worker));
  report(true);
  return { points, located };
}
