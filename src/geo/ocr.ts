/**
 * Text from a screenshot or a PDF, all on the device: PDF text is read with pdf.js; scanned PDFs and images
 * go through Tesseract (Russian + English) served from the app itself, so no file leaves the phone.
 */

type Progress = (stage: string, ratio: number) => void;

const BASE = import.meta.env.BASE_URL;

async function ocrImages(images: Array<Blob | HTMLCanvasElement>, progress: Progress): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  progress('Загружаю распознавание текста', 0.05);
  const abs = (p: string) => new URL(`${BASE}${p}`, location.href).href;
  const worker = await createWorker(['rus', 'eng'], 1, {
    workerPath: abs('ocr/worker.min.js'),
    corePath: abs('ocr/'),
    langPath: abs('ocr/lang'),
    gzip: true,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') progress('Распознаю текст', 0.3 + m.progress * 0.65);
      else if (/load/i.test(m.status)) progress('Загружаю распознавание текста', 0.05 + m.progress * 0.25);
    },
  });
  try {
    const parts: string[] = [];
    for (const img of images) parts.push((await worker.recognize(img)).data.text);
    return parts.join('\n');
  } finally {
    await worker.terminate();
  }
}

async function pdfText(file: Blob, progress: Progress): Promise<string> {
  progress('Читаю PDF', 0.05);
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(doc.numPages, 4);
  let text = '';
  const scans: HTMLCanvasElement[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    let pageText = '';
    for (const item of content.items as Array<{ str: string; transform: number[]; hasEOL?: boolean }>) {
      const y = item.transform[5] ?? 0;
      if (lastY !== null && Math.abs(y - lastY) > 2) pageText += '\n';
      else if (pageText && !pageText.endsWith(' ')) pageText += ' ';
      pageText += item.str;
      lastY = y;
    }
    if (pageText.replace(/\s/g, '').length > 40) text += pageText + '\n';
    else {
      // A scanned page: render it and recognise.
      const vp = page.getViewport({ scale: 2 });
      const c = document.createElement('canvas');
      c.width = vp.width;
      c.height = vp.height;
      await page.render({ canvas: c, viewport: vp }).promise;
      scans.push(c);
    }
    progress('Читаю PDF', 0.05 + (i / pages) * 0.25);
  }
  if (scans.length) text += '\n' + (await ocrImages(scans, progress));
  return text;
}

export async function extractText(file: File, progress: Progress): Promise<string> {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return pdfText(file, progress);
  if (file.type.startsWith('image/')) return ocrImages([file], progress);
  if (file.type.startsWith('text/')) return file.text();
  throw new Error('Поддерживаются изображения, PDF и текст');
}
