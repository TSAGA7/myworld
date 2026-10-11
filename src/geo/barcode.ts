/**
 * Reads the barcode of a boarding pass (PDF417, Aztec, QR or Data Matrix) from a picture or the first page of a PDF,
 * on the device. Returns the raw text or null.
 */
export async function readBarcode(file: Blob & { name?: string }): Promise<string | null> {
  try {
    const canvases = await toCanvases(file);
    if (!canvases.length) return null;
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import('@zxing/browser'), import('@zxing/library')]);
    const hints = new Map<unknown, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.PDF_417, BarcodeFormat.AZTEC, BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX]],
      [DecodeHintType.TRY_HARDER, true],
    ]);
    const reader = new BrowserMultiFormatReader(hints as never);
    for (const c of canvases) {
      try {
        const text = reader.decodeFromCanvas(c).getText();
        if (text) return text;
      } catch {
        /* not found on this page */
      }
    }
  } catch {
    /* unreadable file: no barcode */
  }
  return null;
}

async function toCanvases(file: Blob & { name?: string }): Promise<HTMLCanvasElement[]> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name ?? '')) {
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const out: HTMLCanvasElement[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 2); i++) {
      const page = await doc.getPage(i);
      const vp = page.getViewport({ scale: 3 });
      const c = document.createElement('canvas');
      c.width = vp.width;
      c.height = vp.height;
      await page.render({ canvas: c, viewport: vp }).promise;
      out.push(c);
    }
    return out;
  }
  if (!file.type.startsWith('image/')) return [];
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  (c.getContext('2d') as CanvasRenderingContext2D).drawImage(bmp, 0, 0, c.width, c.height);
  return [c];
}
