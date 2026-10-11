import type { Map as MlMap } from 'maplibre-gl';

/**
 * Pins and cluster badges are drawn on a canvas and handed to MapLibre as images: they render inside WebGL
 * (fast with hundreds of places, correct on the globe) and need no font downloads, so they work offline.
 */
const PR = 2;
const LIME = '#ddf36f';
const LIME_LINE = '#b5d03a';
const DARK = '#232327';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w * PR;
  c.height = h * PR;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(PR, PR);
  return { c, ctx };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function pin(status: 'visited' | 'planned', multi: boolean, dark: boolean) {
  const W = 40;
  const H = 46;
  const { ctx } = canvas(W, H);
  const fill = status === 'visited' ? LIME : dark ? '#f0f0f2' : DARK;
  const glyph = status === 'visited' ? DARK : dark ? DARK : LIME;
  const x = 4;
  const y = 7;
  const s = 30;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;
  if (multi) {
    roundRect(ctx, x + 5, y - 5, s, s, 10);
    ctx.fillStyle = status === 'visited' ? '#eef9b8' : dark ? '#b9b9c0' : '#5a5a62';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
  // Body with the pointer of the reference pins
  roundRect(ctx, x, y, s, s, 10);
  ctx.moveTo(x + s / 2 - 6, y + s - 1);
  ctx.lineTo(x + s / 2, y + s + 7);
  ctx.lineTo(x + s / 2 + 6, y + s - 1);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = status === 'visited' ? '#ffffff' : dark ? '#ffffff' : 'rgba(255,255,255,0.9)';
  roundRect(ctx, x, y, s, s, 10);
  ctx.stroke();
  // Flag glyph
  const fx = x + 10;
  const fy = y + 7;
  ctx.strokeStyle = glyph;
  ctx.fillStyle = glyph;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx, fy + 16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx + 11, fy + 3.5);
  ctx.lineTo(fx, fy + 8);
  ctx.closePath();
  if (status === 'visited') ctx.fill();
  else ctx.stroke();
  return ctx.getImageData(0, 0, W * PR, H * PR);
}

function cluster(kind: 'v' | 'p' | 'mix', count: string, dark: boolean) {
  const S = 44;
  const { ctx } = canvas(S, S);
  const r = 17;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = kind === 'p' ? (dark ? '#f0f0f2' : DARK) : LIME;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = kind === 'mix' ? 4 : 2.5;
  ctx.strokeStyle = kind === 'mix' ? (dark ? '#f0f0f2' : DARK) : '#fff';
  ctx.stroke();
  if (kind === 'v') {
    ctx.lineWidth = 1;
    ctx.strokeStyle = LIME_LINE;
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, r + 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = kind === 'p' ? (dark ? DARK : '#fff') : DARK;
  ctx.font = `700 ${count.length > 2 ? 12 : 15}px Onest, -apple-system, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(count === '99' ? '99+' : count, S / 2, S / 2 + 1);
  return ctx.getImageData(0, 0, S * PR, S * PR);
}

/** Generates any pin or cluster image the style asks for. */
export function installMarkerImages(map: MlMap, isDark: () => boolean): void {
  map.on('styleimagemissing', (e) => {
    const id = e.id;
    if (map.hasImage(id)) return;
    const dark = isDark();
    let m = /^pin-(visited|planned)(-multi)?$/.exec(id);
    if (m) {
      map.addImage(id, pin(m[1] as 'visited' | 'planned', !!m[2], dark), { pixelRatio: PR });
      return;
    }
    m = /^cluster-(v|p|mix)-(\d+)$/.exec(id);
    if (m) map.addImage(id, cluster(m[1] as 'v' | 'p' | 'mix', m[2] as string, dark), { pixelRatio: PR });
  });
}

/** Drops generated images so they are redrawn in the new theme colors. */
export function resetMarkerImages(map: MlMap): void {
  for (const id of map.listImages()) if (id.startsWith('pin-') || id.startsWith('cluster-')) map.removeImage(id);
}
