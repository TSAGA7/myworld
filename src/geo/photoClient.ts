import { loadPhotoIndex, type ScanProgress, type ScanResult, scanPhotos } from './photoScan';

/**
 * Photo scanner used by the screen. Runs in a Web Worker; if the browser cannot start one, the same code runs here.
 * One scanner per open window: `dispose()` ends the worker and frees the city index.
 */
export interface PhotoScanner {
  warm(): void;
  scan(files: File[], today: string, onProgress: (p: ScanProgress) => void): Promise<ScanResult>;
  dispose(): void;
}

const appBase = () => new URL(import.meta.env.BASE_URL, document.baseURI).href;

export function createPhotoScanner(): PhotoScanner {
  let worker: Worker | null = null;
  let broken = false;
  let seq = 0;
  const waiting = new Map<number, { progress?: (p: ScanProgress) => void; ok: (v: unknown) => void; fail: (e: Error) => void }>();

  const failAll = (e: Error) => {
    for (const w of waiting.values()) w.fail(e);
    waiting.clear();
  };
  const getWorker = (): Worker | null => {
    if (broken) return null;
    if (worker) return worker;
    try {
      worker = new Worker(new URL('./photoWorker.ts', import.meta.url), { type: 'module' });
    } catch {
      broken = true;
      return null;
    }
    worker.onmessage = (e: MessageEvent<{ id: number; type: string; progress?: ScanProgress; result?: ScanResult; message?: string }>) => {
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
    worker.onerror = () => {
      // The worker could not load (old browser): fall back to the main thread.
      broken = true;
      worker?.terminate();
      worker = null;
      failAll(new Error('worker'));
    };
    return worker;
  };

  const viaWorker = <T,>(msg: Record<string, unknown>, progress?: (p: ScanProgress) => void): Promise<T> | null => {
    const w = getWorker();
    if (!w) return null;
    const id = ++seq;
    return new Promise<T>((ok, fail) => {
      waiting.set(id, { progress, ok: ok as (v: unknown) => void, fail });
      w.postMessage({ ...msg, id, base: appBase() });
    });
  };

  return {
    warm() {
      const p = viaWorker<void>({ type: 'warm' });
      if (p) p.catch(() => undefined);
      else void loadPhotoIndex(appBase()).catch(() => undefined);
    },
    async scan(files, today, onProgress) {
      const p = viaWorker<ScanResult>({ type: 'scan', files, today }, onProgress);
      if (p) {
        try {
          return await p;
        } catch (e) {
          if (!broken) throw e;
        }
      }
      return scanPhotos(files, today, appBase(), onProgress);
    },
    dispose() {
      worker?.terminate();
      worker = null;
      failAll(new Error('closed'));
    },
  };
}
