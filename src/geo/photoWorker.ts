/// <reference lib="webworker" />
// Photo scanning off the main thread: the screen stays smooth while thousands of photos are read,
// and the city index is freed when the window closes.
import { loadPhotoIndex, scanPhotos } from './photoScan';

type In = { id: number; type: 'warm'; base: string } | { id: number; type: 'scan'; base: string; files: File[]; today: string };

const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'warm') {
      await loadPhotoIndex(m.base);
      post({ id: m.id, type: 'ready' });
      return;
    }
    const result = await scanPhotos(m.files, m.today, m.base, (p) => post({ id: m.id, type: 'progress', progress: p }));
    post({ id: m.id, type: 'done', result });
  } catch (err) {
    post({ id: m.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
