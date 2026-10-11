import { geoEqualEarth, geoPath } from 'd3-geo';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../app/toast';
import { setSetting, useWorld } from '../../app/world';
import { INHABITED_CONTINENTS } from '../../domain/achievements';
import { plural } from '../../domain/dates';
import { loadCountryShapes } from '../../geo/geometry';
import { countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Segmented, Sheet } from '../../ui/kit';
import { useFacts } from './useFacts';
import { travelerStatus } from '../../domain/status';

type Format = 'story' | 'square';
type Look = 'dark' | 'light';

const SIZE: Record<Format, [number, number]> = { story: [1080, 1920], square: [1080, 1350] };
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** Story/post image with the user's travel stats, drawn on a canvas so it can be shared as a PNG. */
export function ShareCardSheet({ onClose }: { onClose: () => void }) {
  const { world, settings } = useWorld();
  const { progress, facts } = useFacts();
  const toast = useToast();
  const [format, setFormat] = useState<Format>('story');
  const [look, setLook] = useState<Look>('dark');
  const [url, setUrl] = useState<string | null>(null);
  const blob = useRef<Blob | null>(null);
  const showStatus = settings.shareStatus;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [w, h] = SIZE[format];
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      await Promise.all([document.fonts.load('760 120px Onest'), document.fonts.load('250 120px Onest'), document.fonts.load('500 40px Onest')]).catch(() => undefined);
      const shapes = await loadCountryShapes();
      const dark = look === 'dark';
      const ink = dark ? '#f2f2f4' : '#1b1b1f';
      const ink2 = dark ? 'rgba(242,242,244,0.62)' : 'rgba(27,27,31,0.6)';
      const lime = '#ddf36f';

      // Background
      const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
      g.addColorStop(0, dark ? '#2a2b30' : '#f1f0f3');
      g.addColorStop(1, dark ? '#0d0d0f' : '#dcdbe0');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const glow = ctx.createRadialGradient(w * 0.8, h * 0.18, 10, w * 0.8, h * 0.18, w * 0.8);
      glow.addColorStop(0, dark ? 'rgba(221,243,111,0.22)' : 'rgba(221,243,111,0.55)');
      glow.addColorStop(1, 'rgba(221,243,111,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const story = format === 'story';
      const pad = 84;
      let y = story ? 170 : 120;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = ink2;
      ctx.font = '600 34px Onest, system-ui, sans-serif';
      ctx.fillText(settings.name ? `${settings.name} · MY WORLD` : 'MY WORLD', pad, y);
      if (showStatus) {
        const st = travelerStatus(progress.visited).status;
        y += 54;
        ctx.fillStyle = ink;
        ctx.font = '600 36px Onest, system-ui, sans-serif';
        ctx.fillText(fit(ctx, `${st.emoji} ${st.title}`, w - pad * 2), pad, y);
      } else y += 54;

      // Big counter
      y += story ? 300 : 250;
      ctx.fillStyle = ink;
      ctx.font = `760 ${story ? 330 : 280}px Onest, system-ui, sans-serif`;
      const big = String(progress.visited);
      ctx.fillText(big, pad - 12, y);
      const bw = ctx.measureText(big).width;
      ctx.font = `250 ${story ? 120 : 100}px Onest, system-ui, sans-serif`;
      ctx.fillStyle = ink2;
      ctx.fillText(`/${progress.total}`, pad + bw, y);
      y += story ? 80 : 70;
      ctx.fillStyle = ink;
      ctx.font = '600 52px Onest, system-ui, sans-serif';
      ctx.fillText(`${plural(progress.visited, 'страна', 'страны', 'стран')} · ${facts.cities} ${plural(facts.cities, 'город', 'города', 'городов')}`, pad, y);

      // Progress bar
      y += 54;
      const barW = w - pad * 2;
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(27,27,31,0.1)';
      roundRect(ctx, pad, y, barW, 26, 13);
      ctx.fill();
      ctx.fillStyle = lime;
      roundRect(ctx, pad, y, Math.max(26, (barW * progress.percent) / 100), 26, 13);
      ctx.fill();
      y += 80;
      ctx.fillStyle = ink2;
      ctx.font = '500 38px Onest, system-ui, sans-serif';
      ctx.fillText(`${String(progress.percent).replace('.', ',')}% мира исследовано`, pad, y);

      // Map
      y += story ? 50 : 30;
      const mapH = story ? 560 : 460;
      const proj = geoEqualEarth().fitExtent(
        [
          [pad - 20, y],
          [w - pad + 20, y + mapH],
        ],
        { type: 'Sphere' } as never,
      );
      const path = geoPath(proj, ctx);
      for (const f of shapes.features) {
        if (f.properties.id === 'AQ') continue;
        ctx.beginPath();
        path(f);
        const s = world.countryStatus.get(f.properties.id);
        ctx.fillStyle = s === 'visited' ? lime : dark ? 'rgba(255,255,255,0.13)' : 'rgba(27,27,31,0.12)';
        ctx.fill();
        if (s === 'planned') {
          ctx.strokeStyle = ink2;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      }
      y += mapH + (story ? 80 : 50);

      // Facts
      const inhabited = facts.continents.filter((x) => (INHABITED_CONTINENTS as readonly string[]).includes(x)).length;
      const tiles: Array<[string, string]> = [
        [`${inhabited}/6`, 'континентов'],
        [String(facts.trips), plural(facts.trips, 'поездка', 'поездки', 'поездок')],
      ];
      if (facts.routeKm > 0) tiles.push([`${Math.round(facts.routeKm / 1000).toLocaleString('ru-RU')} тыс.`, 'км по маршрутам']);
      if (facts.farthestFromHome) tiles.push([`${Math.round(facts.farthestFromHome.km / 100) / 10} тыс. км`, `дальше всего — ${facts.farthestFromHome.city.name}`]);
      else if (facts.north) tiles.push([`${(facts.north.lat as number).toFixed(0)}° с. ш.`, `северная точка — ${facts.north.name}`]);
      else if (facts.topCountry) tiles.push([String(facts.topCountry.cities), `городов: ${countryName(facts.topCountry.id)}`]);
      const cols = 2;
      const gap = 24;
      const tw = (w - pad * 2 - gap) / cols;
      const th = story ? 190 : 170;
      tiles.slice(0, story ? 4 : 4).forEach(([v, label], i) => {
        const x = pad + (i % cols) * (tw + gap);
        const ty = y + Math.floor(i / cols) * (th + gap);
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)';
        roundRect(ctx, x, ty, tw, th, 36);
        ctx.fill();
        ctx.strokeStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.font = '720 64px Onest, system-ui, sans-serif';
        ctx.fillText(v, x + 34, ty + 90);
        ctx.fillStyle = ink2;
        ctx.font = '500 32px Onest, system-ui, sans-serif';
        ctx.fillText(fit(ctx, label, tw - 68), x + 34, ty + 142);
      });

      // Footer
      const now = new Date();
      ctx.fillStyle = ink2;
      ctx.font = '500 30px Onest, system-ui, sans-serif';
      ctx.fillText(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`, pad, h - 90);
      ctx.textAlign = 'right';
      ctx.fillText('tsaga7.github.io/myworld', w - pad, h - 90);
      ctx.textAlign = 'left';

      const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
      if (!alive || !b) return;
      blob.current = b;
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(b);
      });
    })().catch((e) => toast(`Не удалось нарисовать карточку: ${e instanceof Error ? e.message : e}`));
    return () => {
      alive = false;
    };
  }, [format, look, showStatus, progress, facts, world, settings.name, toast]);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const share = async () => {
    const b = blob.current;
    if (!b) return;
    const file = new File([b], `myworld-${progress.visited}-countries.png`, { type: 'image/png' });
    const data = { files: [file], title: 'MY WORLD', text: `${progress.visited} ${plural(progress.visited, 'страна', 'страны', 'стран')} и ${progress.percent}% мира` };
    if (navigator.canShare?.(data)) {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = file.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 20_000);
    toast('Картинка сохранена');
  };

  return (
    <Sheet
      title="Карточка для соцсетей"
      onClose={onClose}
      footer={
        <button type="button" className="btn lime" disabled={!url} onClick={() => void share()}>
          <Icon name="share" size={18} /> Поделиться
        </button>
      }
    >
      <div className="row wrap">
        <Segmented label="Формат" value={format} onChange={setFormat} options={[{ value: 'story', label: 'Сторис' }, { value: 'square', label: 'Пост' }]} />
        <Segmented label="Тема" value={look} onChange={setLook} options={[{ value: 'dark', label: 'Тёмная' }, { value: 'light', label: 'Светлая' }]} />
      </div>
      <div className="list">
        <label className="list-row tap">
          <span className="grow">
            <span className="t">Статус на карточке</span>
            <span className="s block">
              {travelerStatus(progress.visited).status.emoji} {travelerStatus(progress.visited).status.title}
            </span>
          </span>
          <input type="checkbox" className="switch" checked={showStatus} onChange={(e) => void setSetting('shareStatus', e.target.checked)} />
        </label>
      </div>
      <div className={`share-preview ${format}`}>{url ? <img src={url} alt="Карточка с количеством стран и городов" /> : <span className="spinner" />}</div>
    </Sheet>
  );
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

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 3 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
