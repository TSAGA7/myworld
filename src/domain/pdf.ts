/**
 * Minimal PDF writer: every page is one full-page JPEG (drawn on a canvas in the app's style).
 * No library needed and no fonts to embed — the text is already in the picture.
 */
export interface PdfPage {
  jpeg: Uint8Array;
  /** Pixel size of the image. */
  width: number;
  height: number;
}

const A4: [number, number] = [595.28, 841.89];

export function makePdf(pages: readonly PdfPage[], title = 'MY WORLD'): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(u);
    size += u.length;
  };
  const obj = (n: number, body: () => void) => {
    offsets[n] = size;
    push(`${n} 0 obj\n`);
    body();
    push('\nendobj\n');
  };
  // 1 catalog, 2 pages, 3 info; then per page: page, content, image.
  const pageIds = pages.map((_, i) => 4 + i * 3);
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`));
  const safeTitle = Array.from(title)
    .map((c) => c.codePointAt(0)!.toString(16).padStart(4, '0'))
    .join('');
  obj(3, () => push(`<< /Title <FEFF${safeTitle}> /Producer (MY WORLD) >>`));
  pages.forEach((p, i) => {
    const id = pageIds[i] as number;
    const [w, h] = A4;
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`;
    obj(id, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`));
    obj(id + 1, () => push(`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`));
    obj(id + 2, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
  });
  const count = 4 + pages.length * 3;
  const xref = size;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let i = 1; i < count; i++) push(`${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
