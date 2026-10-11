import qrcode from 'qrcode-generator';
import { useId, useMemo } from 'react';

type QrFactory = typeof qrcode & { stringToBytesFuncs?: Record<string, (s: string) => number[]>; stringToBytes: (s: string) => number[] };

/** Modules of a QR code (true = dark), level M, UTF-8. */
export function qrMatrix(text: string): boolean[][] {
  const f = qrcode as QrFactory;
  const utf8 = f.stringToBytesFuncs?.['UTF-8'];
  if (utf8) f.stringToBytes = utf8;
  const q = qrcode(0, 'M');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => q.isDark(r, c)));
}

const isFinder = (r: number, c: number, n: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

/**
 * A QR code with round modules and a warm orange → red gradient, like on the reference boarding pass.
 * Finder squares keep sharp corners: rounded ones look nicer but some scanners stop finding the code.
 */
export function GradientQr({ text, size = 220 }: { text: string; size?: number }) {
  const id = useId().replace(/:/g, '');
  const m = useMemo(() => qrMatrix(text), [text]);
  const n = m.length;
  const q = 2; // quiet zone, modules
  const dots: string[] = [];
  m.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark && !isFinder(r, c, n)) dots.push(`M${c + q + 0.5} ${r + q + 0.08}a.42 .42 0 1 1 0 .84a.42 .42 0 1 1 0-.84`);
    }),
  );
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x + q + 0.5} y={y + q + 0.5} width={6} height={6} fill="none" stroke={`url(#${id})`} strokeWidth={1} />
      <rect x={x + q + 2} y={y + q + 2} width={3} height={3} fill={`url(#${id})`} />
    </g>
  );
  const box = n + q * 2;
  return (
    <svg className="qr" width={size} height={size} viewBox={`0 0 ${box} ${box}`} role="img" aria-label="QR-код">
      <defs>
        <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={box} y2={box}>
          <stop offset="0" stopColor="#ff7a1a" />
          <stop offset="0.5" stopColor="#f0402a" />
          <stop offset="1" stopColor="#c8102e" />
        </linearGradient>
      </defs>
      <rect width={box} height={box} rx={2} fill="#fff" />
      <path d={dots.join('')} fill={`url(#${id})`} />
      {finder(0, 0)}
      {finder(n - 7, 0)}
      {finder(0, n - 7)}
    </svg>
  );
}

/** PNG of an inline SVG element, for saving. */
export async function svgToPng(svg: SVGSVGElement, px: number): Promise<Blob | null> {
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = px;
  c.height = px;
  (c.getContext('2d') as CanvasRenderingContext2D).drawImage(img, 0, 0, px, px);
  return new Promise((r) => c.toBlob(r, 'image/png'));
}
