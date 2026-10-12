import type { ResolvedPoint } from '../domain/photoPlaces';
import type { PhotoIndex } from './photoGeo';
import { type FoundPlace, readCatalogRows } from './photoGeo';
import { type IndexData, makeIndex, type ScanProgress, scanPhotos } from './photoScan';

export interface ScanResult {
  points: ResolvedPoint[];
  located: number;
  places: FoundPlace[];
}

/**
 * Photo scanner used by the screen. Runs in a Web Worker; if the browser cannot start one, the same code runs here.
 * The files are fetched by the page, so they come from the offline cache, not the network.
 */
export interface PhotoScanner {
  /** Loads the index (~3 MB). Safe to call many times. */
  prepare(): Promise<void>;
  scan(files: File[], today: string, onProgress: (p: ScanProgress) => void): Promise<ScanResult>;
  dispose(): void;
}

const url = (path: string) => new URL(`${import.meta.env.BASE_URL}${path}`, document.baseURI).href;

async function get(path: string, ms = 30_000): Promise<Response> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url(path), { signal: ctl.signal });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r;
  } catch (e) {
    throw new Error(
      e instanceof DOMException && e.name === 'AbortError'
        ? 'Справочник городов долго грузится. Проверьте интернет и попробуйте ещё раз — после первой загрузки он работает без сети.'
        : `Не удалось загрузить справочник городов (${e instanceof Error ? e.message : e})`,
    );
  } finally {
    window.clearTimeout(t);
  }
}

const loadIndexData = async (): Promise<IndexData> => {
  const [bin, shapes] = await Promise.all([get('data/photo-index.bin').then((r) => r.arrayBuffer()), get('data/countries.geojson').then((r) => r.arrayBuffer())]);
  return { bin, shapes };
};

/** City names for the catalog rows found in the photos; points whose row does not match are kept without a city. */
async function attachNames(points: ResolvedPoint[]): Promise<{ points: ResolvedPoint[]; places: FoundPlace[] }> {
  const rows = new Set(points.filter((p) => p.cityId !== null).map((p) => Number(p.cityId)));
  if (!rows.size) return { points, places: [] };
  const [regions, tsv] = await Promise.all([
    get('data/region-names.json').then((r) => r.json() as Promise<Record<string, string>>).catch(() => ({}) as Record<string, string>),
    get('data/cities.tsv'),
  ]);
  const byRow = await readCatalogRows(tsv.body, rows, regions);
  const out = points.map((p) => {
    if (p.cityId === null) return p;
    const place = byRow.get(Number(p.cityId));
    return { ...p, cityId: place && place.countryId === p.countryId ? place.id : null };
  });
  return { points: out, places: [...new Map([...byRow.values()].map((x) => [x.id, x])).values()] };
}

export function createPhotoScanner(): PhotoScanner {
  let worker: Worker | null = null;
  let useWorker = typeof Worker !== 'undefined';
  let ready: Promise<void> | null = null;
  let local: PhotoIndex | null = null;
  let seq = 0;
  const waiting = new Map<number, { progress?: (p: ScanProgress) => void; ok: (v: unknown) => void; fail: (e: Error) => void }>();

  const failAll = (e: Error) => {
    for (const w of waiting.values()) w.fail(e);
    waiting.clear();
  };
  const start = (): Worker | null => {
    if (!useWorker) return null;
    if (worker) return worker;
    try {
      worker = new Worker(new URL('./photoWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      useWorker = false;
      return null;
    }
    worker.onmessage = (e: MessageEvent<{ id: number; type: string; progress?: ScanProgress; result?: unknown; message?: string }>) => {
      const m = e.data;
      const w = waiting.get(m.id);
      if (!w) return;
      if (m.type === 'progress' && m.progress) w.progress?.(m.progress);
      else {
        waiting.delete(m.id);
        if (m.type === 'error') w.fail(new Error(m.message ?? 'ошибка'));
        else w.ok(m.result);
      }
    };
    worker.onerror = (e) => {
      // The worker script could not start (old browser): continue on the main thread.
      e.preventDefault();
      useWorker = false;
      worker?.terminate();
      worker = null;
      failAll(new Error('worker'));
    };
    return worker;
  };
  const call = <T,>(w: Worker, msg: Record<string, unknown>, transfer: Transferable[] = [], progress?: (p: ScanProgress) => void) =>
    new Promise<T>((ok, fail) => {
      const id = ++seq;
      waiting.set(id, { progress, ok: ok as (v: unknown) => void, fail });
      w.postMessage({ ...msg, id }, transfer);
    });

  const prepare = (): Promise<void> => {
    if (!ready) {
      ready = (async () => {
        const data = await loadIndexData();
        const w = start();
        if (w) {
          try {
            await call<void>(w, { type: 'index', data }, [data.bin, data.shapes]);
            return;
          } catch (e) {
            if (useWorker) throw e;
            // Worker failed to start: the buffers were transferred, load them again for the page.
            local = makeIndex(await loadIndexData());
            return;
          }
        }
        local = makeIndex(data);
      })();
      ready.catch(() => (ready = null));
    }
    return ready;
  };

  return {
    prepare,
    async scan(files, today, onProgress) {
      await prepare();
      let raw: { points: ResolvedPoint[]; located: number } | null = null;
      if (worker && useWorker) {
        try {
          raw = await call(worker, { type: 'scan', files, today }, [], onProgress);
        } catch (e) {
          if (useWorker) throw e;
        }
      }
      if (!raw) {
        local ??= makeIndex(await loadIndexData());
        raw = await scanPhotos(local, files, today, onProgress);
      }
      const named = await attachNames(raw.points);
      return { ...named, located: raw.located };
    },
    dispose() {
      worker?.terminate();
      worker = null;
      local = null;
      failAll(new Error('closed'));
    },
  };
}
