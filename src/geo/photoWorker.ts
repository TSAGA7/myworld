/// <reference lib="webworker" />
// Photo scanning off the main thread: the animation stays smooth while thousands of photos are read.
// The page loads the index files (through the offline cache) and hands them over; the worker never touches the network.
import type { PhotoIndex } from './photoGeo';
import { type IndexData, makeIndex, scanPhotos } from './photoScan';

type In = { id: number; type: 'index'; data: IndexData } | { id: number; type: 'scan'; files: File[]; today: string };

const post = (m: unknown) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
let index: PhotoIndex | null = null;

self.onmessage = async (e: MessageEvent<In>) => {
  const m = e.data;
  try {
    if (m.type === 'index') {
      index = makeIndex(m.data);
      post({ id: m.id, type: 'done' });
      return;
    }
    if (!index) throw new Error('Справочник не загружен');
    const result = await scanPhotos(index, m.files, m.today, (p) => post({ id: m.id, type: 'progress', progress: p }));
    post({ id: m.id, type: 'done', result });
  } catch (err) {
    post({ id: m.id, type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
