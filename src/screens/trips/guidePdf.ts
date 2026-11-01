import type { GuideBlock } from '../../domain/guideBlocks';
import { makePdf, type PdfPage } from '../../domain/pdf';
import { flagUrl } from '../../geo/reference';

/** What the PDF shows: the same data the guide screen shows. */
export interface GuidePdfInput {
  tripTitle: string;
  dates: string;
  author: string;
  days: Array<{ label: string; city: string; items: Array<{ time: string | null; text: string }> }>;
  cities: Array<{
    name: string;
    countryId: string;
    source: string;
    sections: Array<{ icon: string; title: string; blocks: GuideBlock[] }>;
  }>;
}

// A4 at 150 dpi.
const W = 1240;
const H = 1754;
const PAD = 96;
const TOP = 190;
const BOTTOM = H - 130;
const INK = '#1b1b1f';
const INK2 = 'rgba(27,27,31,0.62)';
const INK3 = 'rgba(27,27,31,0.42)';
const LIME = '#ddf36f';
const LIME_DEEP = '#c4e04a';
const PAPER = '#efeef2';
const CARD = '#fbfbfc';
const FONT = 'Onest, system-ui, -apple-system, sans-serif';

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

const loadImage = (src: string) =>
  new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** Draws the guide page by page in the app's look (paper, lime, Onest, MY WORLD) and packs the pages into a PDF. */
export async function renderGuidePdf(input: GuidePdfInput, onPage?: (n: number) => void): Promise<{ blob: Blob; pages: number }> {
  await Promise.all([font(760, 40), font(500, 30), font(300, 40)].map((f) => document.fonts.load(f).catch(() => undefined)));
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const pages: PdfPage[] = [];
  const flags = new Map<string, HTMLImageElement | null>();
  const flag = async (id: string) => {
    if (!flags.has(id)) {
      const url = flagUrl(id);
      flags.set(id, url ? await loadImage(url) : null);
    }
    return flags.get(id) ?? null;
  };

  const background = (glow: boolean) => {
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    if (glow) {
      const g = ctx.createRadialGradient(W * 0.85, H * 0.12, 10, W * 0.85, H * 0.12, W * 0.9);
      g.addColorStop(0, 'rgba(221,243,111,0.75)');
      g.addColorStop(1, 'rgba(221,243,111,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  };
  const brand = (x: number, y: number, size: number) => {
    ctx.fillStyle = INK;
    ctx.font = font(250, size);
    ctx.fillText('MY ', x, y);
    const w = ctx.measureText('MY ').width;
    ctx.font = font(800, size);
    ctx.fillText('WORLD', x + w, y);
  };
  const chrome = () => {
    background(false);
    ctx.textBaseline = 'alphabetic';
    brand(PAD, 120, 34);
    ctx.font = font(500, 26);
    ctx.fillStyle = INK2;
    const t = input.tripTitle;
    ctx.textAlign = 'right';
    ctx.fillText(t.length > 40 ? `${t.slice(0, 38)}…` : t, W - PAD, 120);
    ctx.textAlign = 'left';
    ctx.fillStyle = LIME_DEEP;
    ctx.fillRect(PAD, 144, 64, 6);
  };
  const footer = (n: number) => {
    ctx.font = font(500, 24);
    ctx.fillStyle = INK3;
    ctx.fillText('Путеводитель MY WORLD', PAD, H - 64);
    ctx.textAlign = 'right';
    ctx.fillText(String(n), W - PAD, H - 64);
    ctx.textAlign = 'left';
  };
  const flush = async () => {
    footer(pages.length + 1);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
    if (!blob) throw new Error('Не удалось нарисовать страницу');
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), width: W, height: H });
    onPage?.(pages.length);
  };

  let y = TOP;
  const newPage = async () => {
    await flush();
    chrome();
    y = TOP + 40;
  };
  const need = async (h: number) => {
    if (y + h > BOTTOM) await newPage();
  };
  /** Wrapped text block; breaks across pages line by line. */
  const text = async (s: string, opts: { size: number; weight: number; color: string; x?: number; width?: number; line?: number }) => {
    const x = opts.x ?? PAD;
    const width = opts.width ?? W - PAD - x;
    const lh = opts.line ?? Math.round(opts.size * 1.45);
    ctx.font = font(opts.weight, opts.size);
    for (const l of wrap(ctx, s, width)) {
      await need(lh);
      ctx.font = font(opts.weight, opts.size);
      ctx.fillStyle = opts.color;
      ctx.fillText(l, x, y + opts.size);
      y += lh;
    }
  };

  // ---------- Cover
  background(true);
  ctx.textBaseline = 'alphabetic';
  brand(PAD, 170, 44);
  ctx.fillStyle = LIME;
  roundRect(ctx, PAD, 560, 330, 64, 32);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = font(650, 30);
  ctx.fillText('ПУТЕВОДИТЕЛЬ', PAD + 32, 603);
  y = 680;
  ctx.font = font(780, 104);
  for (const l of wrap(ctx, input.tripTitle, W - PAD * 2).slice(0, 3)) {
    ctx.fillStyle = INK;
    ctx.fillText(l, PAD - 4, y + 96);
    y += 116;
  }
  if (input.dates) {
    ctx.font = font(400, 40);
    ctx.fillStyle = INK2;
    ctx.fillText(input.dates, PAD, y + 50);
    y += 80;
  }
  y += 40;
  for (const c of input.cities.slice(0, 8)) {
    const img = await flag(c.countryId);
    if (img) ctx.drawImage(img, PAD, y + 4, 56, 42);
    ctx.font = font(600, 40);
    ctx.fillStyle = INK;
    ctx.fillText(c.name, PAD + (img ? 80 : 0), y + 40);
    y += 70;
  }
  ctx.font = font(500, 28);
  ctx.fillStyle = INK2;
  ctx.fillText([input.author, `${input.cities.length} ${input.cities.length === 1 ? 'город' : input.cities.length < 5 ? 'города' : 'городов'}`, input.days.length ? `${input.days.length} дн.` : ''].filter(Boolean).join(' · '), PAD, H - 140);
  await flush();

  // ---------- Day plan
  if (input.days.length) {
    chrome();
    y = TOP + 40;
    await text('План по дням', { size: 64, weight: 780, color: INK, line: 90 });
    y += 10;
    for (const d of input.days) {
      const rows = Math.max(1, d.items.length);
      await need(70 + rows * 46);
      const top = y;
      ctx.font = font(700, 34);
      ctx.fillStyle = INK;
      ctx.fillText(d.label, PAD + 32, y + 34);
      if (d.city) {
        ctx.font = font(500, 28);
        ctx.fillStyle = INK2;
        ctx.textAlign = 'right';
        ctx.fillText(d.city, W - PAD, y + 34);
        ctx.textAlign = 'left';
      }
      y += 56;
      if (!d.items.length) await text('Свободный день', { size: 28, weight: 400, color: INK3, x: PAD + 32, line: 44 });
      for (const it of d.items) await text(`${it.time ? `${it.time}  ` : ''}${it.text}`, { size: 28, weight: 450, color: INK, x: PAD + 32, line: 44 });
      ctx.fillStyle = LIME_DEEP;
      ctx.fillRect(PAD, top + 4, 6, Math.min(y, BOTTOM) - top - 10);
      y += 26;
    }
    await flush();
  }

  // ---------- Cities
  for (const c of input.cities) {
    chrome();
    y = TOP + 40;
    const img = await flag(c.countryId);
    if (img) {
      ctx.drawImage(img, PAD, y + 22, 80, 60);
    }
    ctx.font = font(800, 84);
    ctx.fillStyle = INK;
    ctx.fillText(c.name, PAD + (img ? 108 : 0), y + 80);
    y += 130;
    for (const s of c.sections) {
      await need(150);
      // Section header: lime pill with the emoji, then the title.
      ctx.fillStyle = LIME;
      roundRect(ctx, PAD, y, 64, 64, 32);
      ctx.fill();
      ctx.font = font(400, 34);
      ctx.textAlign = 'center';
      ctx.fillText(s.icon, PAD + 32, y + 45);
      ctx.textAlign = 'left';
      ctx.font = font(760, 46);
      ctx.fillStyle = INK;
      ctx.fillText(s.title, PAD + 88, y + 48);
      y += 92;
      for (const b of s.blocks) {
        if (b.kind === 'p') {
          await text(b.text, { size: 30, weight: 400, color: INK });
          y += 14;
        } else if (b.kind === 'h') {
          await need(80);
          y += 8;
          await text(b.text, { size: 34, weight: 700, color: INK });
          y += 4;
        } else if (b.kind === 'li') {
          await need(44);
          ctx.fillStyle = LIME_DEEP;
          ctx.beginPath();
          ctx.arc(PAD + 10, y + 22, 7, 0, Math.PI * 2);
          ctx.fill();
          await text(b.text, { size: 30, weight: 400, color: INK, x: PAD + 36 });
          y += 8;
        } else {
          // Place card: white card with a lime number, the name, address line and the description.
          ctx.font = font(400, 28);
          const body = b.text ? wrap(ctx, b.text, W - PAD * 2 - 140) : [];
          const h = 74 + (b.info ? 42 : 0) + body.length * 41 + 26;
          if (h < BOTTOM - TOP) await need(h);
          const top = y;
          const cardH = Math.min(h, BOTTOM - y);
          ctx.fillStyle = CARD;
          roundRect(ctx, PAD, top, W - PAD * 2, cardH, 28);
          ctx.fill();
          ctx.fillStyle = LIME;
          roundRect(ctx, PAD + 26, top + 26, 52, 52, 26);
          ctx.fill();
          ctx.fillStyle = INK;
          ctx.font = font(760, 28);
          ctx.textAlign = 'center';
          ctx.fillText(String(b.n ?? '•'), PAD + 52, top + 62);
          ctx.textAlign = 'left';
          y = top + 22;
          await text(b.name, { size: 34, weight: 720, color: INK, x: PAD + 104, width: W - PAD * 2 - 130, line: 46 });
          if (b.info) await text(b.info, { size: 26, weight: 500, color: INK2, x: PAD + 104, width: W - PAD * 2 - 130, line: 38 });
          if (b.text) await text(b.text, { size: 28, weight: 400, color: INK, x: PAD + 104, width: W - PAD * 2 - 140, line: 41 });
          y += 40;
        }
      }
      y += 26;
    }
    await text(c.source, { size: 22, weight: 400, color: INK3, line: 32 });
    await flush();
  }

  const bytes = makePdf(pages, `Путеводитель — ${input.tripTitle}`);
  return { blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }), pages: pages.length };
}
