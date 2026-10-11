import { useEffect, useState } from 'react';
import { store } from '../app/world';

export const MAX_FILE = 25 * 1024 * 1024;

/**
 * Photos of tickets and confirmations are downscaled to 2000 px JPEG before saving: an iPhone photo drops from
 * ~4 MB to ~400 KB, which keeps IndexedDB small and backups light. PDFs and other files are stored as they are.
 */
export async function prepareFile(file: File): Promise<{ name: string; blob: Blob }> {
  if (file.size > MAX_FILE) throw new Error(`Файл больше ${MAX_FILE / 1024 / 1024} МБ`);
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) return { name: file.name, blob: file };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 900_000) {
      bmp.close();
      return { name: file.name, blob: file };
    }
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return { name: file.name, blob: file };
    return { name: file.name.replace(/\.(png|webp|heic|heif)$/i, '.jpg'), blob };
  } catch {
    // The browser cannot decode this image (e.g. HEIC on desktop): keep the original.
    return { name: file.name, blob: file };
  }
}

/** Object URL for a stored attachment, revoked when the component goes away. */
export function useAttachmentUrl(id: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setUrl(null);
      return;
    }
    let alive = true;
    let made: string | null = null;
    store.getBlob(id).then((b) => {
      if (!alive || !b) return;
      made = URL.createObjectURL(b);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [id]);
  return url;
}

export const fileSize = (n: number): string => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} КБ` : `${(n / 1024 / 1024).toFixed(1)} МБ`);
