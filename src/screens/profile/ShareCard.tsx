import { geoAzimuthalEqualArea, geoCentroid, geoEqualEarth, geoPath } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
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
import { useHomeCountry } from '../countries/HomeCountry';
import { useHomeStats } from '../countries/homeStats';

type Format = 'story' | 'square';
type Look = 'dark' | 'light';
type Scope = 'world' | 'home';

const SIZE: Record<Format, [number, number]> = { story: [1080, 1920], square: [1080, 1350] };
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** Story/post image with the user's travel stats, drawn on a canvas so it can be shared as a PNG. */
export function ShareCardSheet({ onClose }: { onClose: () => void }) {
  const { world, settings } = useWorld();
  const { progress, facts } = useFacts();
  const toast = useToast();
  const [format, setFormat] = useState<Format>('story');
  const [look, setLook] = useState<Look>('dark');
  const home = useHomeCountry();
  const [scopePick, setScope] = useState<Scope>('world');
  const scope: Scope = home ? scopePick : 'world';
  const hs = useHomeStats(scope === 'home' ? home : null);
  // The country card waits for regions and the city catalog, so its numbers match «Моя страна».
  const homeReady = scope === 'world' || (hs.regions !== null && (hs.local !== null || hs.failed));
  const [url, setUrl] = useState<string | null>(null);
  const blob = useRef<Blob | null>(null);
  const showStatus = settings.shareStatus;

  useEffect(() => {
    let alive = true;
    if (!homeReady) {
      setUrl(null);
      blob.current = null;
      return;
    }
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
      const brand = scope === 'home' && home ? `MY WORLD · ${countryName(home)}` : 'MY WORLD';
      ctx.fillText(fit(ctx, settings.name ? `${settings.name} · ${brand}` : brand, w - pad * 2), pad, y);
      if (showStatus) {
        const st = travelerStatus(progress.visited).status;
        y += 54;
        ctx.fillStyle = ink;
        ctx.font = '600 36px Onest, system-ui, sans-serif';
        ctx.fillText(fit(ctx, `${st.emoji} ${st.title}`, w - pad * 2), pad, y);
      } else y += 54;

      const homeId = scope === 'home' ? home : null;
      const km = (n: number) => `${String(Math.round(n / 100) / 10).replace('.', ',')} тыс. км`;
      const pctText = (n: number) => String(n).replace('.', ',');
      let bigN: string;
      let ofN: string | null;
      let line: string;
      let pct: number;
      let pctLabel: string;
      if (homeId && hs.total > 0) {
        bigN = String(hs.opened);
        ofN = `/${hs.total}`;
        line = `${plural(hs.total, 'регион', 'региона', 'регионов')} · ${hs.visited.length} ${plural(hs.visited.length, 'город', 'города', 'городов')}`;
        pct = hs.percent;
        pctLabel = `${pctText(pct)}% страны открыто`;
      } else if (homeId) {
        // No regions for this country: count cities, progress by big cities.
        const bigTotal = hs.local?.big.length ?? 0;
        bigN = String(hs.visited.length);
        ofN = null;
        line = `${plural(hs.visited.length, 'город', 'города', 'городов')} · ${countryName(homeId)}`;
        pct = bigTotal ? Math.round(((hs.bigVisited ?? 0) / bigTotal) * 1000) / 10 : 0;
        pctLabel = `${pctText(pct)}% крупных городов`;
      } else {
        bigN = String(progress.visited);
        ofN = `/${progress.total}`;
        line = `${plural(progress.visited, 'страна', 'страны', 'стран')} · ${facts.cities} ${plural(facts.cities, 'город', 'города', 'городов')}`;
        pct = progress.percent;
        pctLabel = `${pctText(pct)}% мира исследовано`;
      }

      // Big counter
      y += story ? 300 : 250;
      ctx.fillStyle = ink;
      ctx.font = `760 ${story ? 330 : 280}px Onest, system-ui, sans-serif`;
      ctx.fillText(bigN, pad - 12, y);
      const bw = ctx.measureText(bigN).width;
      if (ofN) {
        ctx.font = `250 ${story ? 120 : 100}px Onest, system-ui, sans-serif`;
        ctx.fillStyle = ink2;
        ctx.fillText(ofN, pad + bw, y);
      }
      y += story ? 80 : 70;
      ctx.fillStyle = ink;
      ctx.font = '600 52px Onest, system-ui, sans-serif';
      ctx.fillText(fit(ctx, line, w - pad * 2), pad, y);

      // Progress bar
      y += 54;
      const barW = w - pad * 2;
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(27,27,31,0.1)';
      roundRect(ctx, pad, y, barW, 26, 13);
      ctx.fill();
      ctx.fillStyle = lime;
      roundRect(ctx, pad, y, Math.max(26, (barW * pct) / 100), 26, 13);
      ctx.fill();
      y += 80;
      ctx.fillStyle = ink2;
      ctx.font = '500 38px Onest, system-ui, sans-serif';
      ctx.fillText(pctLabel, pad, y);

      // Map
      y += story ? 50 : 30;
      const mapH = story ? 560 : 300;
      const box: [[number, number], [number, number]] = [
        [pad - 20, y],
        [w - pad + 20, y + mapH],
      ];
      const off = dark ? 'rgba(255,255,255,0.13)' : 'rgba(27,27,31,0.12)';
      const homeShape = homeId ? shapes.features.find((f) => f.properties.id === homeId) : undefined;
      if (homeId && (hs.regions?.length || homeShape)) {
        const fc = { type: 'FeatureCollection', features: hs.regions?.length ? hs.regions : [homeShape] } as FeatureCollection;
        const [cx, cy] = geoCentroid(fc);
        const proj = geoAzimuthalEqualArea().rotate([-cx, -cy]).fitExtent(box, fc);
        const path = geoPath(proj, ctx);
        // Centre the country vertically in the map box.
        const bnd = geoPath(proj).bounds(fc);
        const dy = (mapH - (bnd[1][1] - bnd[0][1])) / 2 - (bnd[0][1] - y);
        ctx.save();
        ctx.translate(0, dy);
        if (hs.regions?.length) {
          for (const r of hs.regions) {
            ctx.beginPath();
            path(r);
            ctx.fillStyle = hs.openedRegions.has(r.properties.id) ? lime : off;
            ctx.fill();
            ctx.strokeStyle = dark ? '#1a1b1f' : '#e6e5ea';
            ctx.lineWidth = 1.4;
            ctx.stroke();
          }
        } else if (homeShape) {
          ctx.beginPath();
          path(homeShape);
          ctx.fillStyle = off;
          ctx.fill();
        }
        // Visited cities: lime dots with a ring, so small regions (Moscow, St Petersburg) still show up.
        for (const v of hs.visited) {
          if (v.lat === null || v.lon === null) continue;
          const p = proj([v.lon, v.lat]);
          if (!p) continue;
          ctx.beginPath();
          ctx.arc(p[0], p[1], 9, 0, Math.PI * 2);
          ctx.fillStyle = lime;
          ctx.fill();
          ctx.strokeStyle = dark ? '#0d0d0f' : '#1b1b1f';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.restore();
      } else {
        const proj = geoEqualEarth().fitExtent(box, { type: 'Sphere' } as never);
        const path = geoPath(proj, ctx);
        for (const f of shapes.features) {
          if (f.properties.id === 'AQ') continue;
          ctx.beginPath();
          path(f);
          const s = world.countryStatus.get(f.properties.id);
          ctx.fillStyle = s === 'visited' ? lime : off;
          ctx.fill();
          if (s === 'planned') {
            ctx.strokeStyle = ink2;
            ctx.lineWidth = 1.6;
            ctx.stroke();
          }
        }
      }
      y += mapH + (story ? 80 : 40);

      // One interesting fact as a line of its own, then the tiles: long labels never squeeze into a tile.
      let fact: string | null;
      const tiles: Array<[string, string]> = [];
      if (homeId) {
        let top: { name: string; n: number } | null = null;
        for (const r of hs.regions ?? []) {
          const n = hs.openedRegions.get(r.properties.id) ?? 0;
          if (n > 1 && (!top || n > top.n)) top = { name: r.properties.ru, n };
        }
        const north = hs.visited.filter((v) => v.lat !== null).sort((a, b) => (b.lat as number) - (a.lat as number))[0];
        fact = top
          ? `🏙 Больше всего городов — ${top.name}: ${top.n}`
          : north && hs.visited.length > 1
            ? `🧭 Северная точка — ${north.name}, ${(north.lat as number).toFixed(0)}° с. ш.`
            : null;
        if (hs.local && hs.bigVisited !== null) tiles.push([`${hs.bigVisited}/${hs.local.big.length}`, 'крупных городов']);
        if (hs.local && hs.seatsVisited !== null && hs.local.seats.length > 0) tiles.push([`${hs.seatsVisited}/${hs.local.seats.length}`, 'центров регионов']);
        if (hs.total > 0) tiles.push([String(hs.total - hs.opened), `${plural(hs.total - hs.opened, 'регион', 'региона', 'регионов')} впереди`]);
        if (hs.total > 0) tiles.push([String(hs.visited.length), plural(hs.visited.length, 'город', 'города', 'городов')]);
      } else {
        fact = facts.farthestFromHome
          ? `📍 Дальше всего от дома — ${facts.farthestFromHome.city.name}, ${km(facts.farthestFromHome.km)}`
          : facts.north
            ? `🧭 Северная точка — ${facts.north.name}, ${(facts.north.lat as number).toFixed(0)}° с. ш.`
            : facts.topCountry && facts.topCountry.cities > 1
              ? `🏙 Больше всего городов — ${countryName(facts.topCountry.id)}: ${facts.topCountry.cities}`
              : null;
        // Only numbers worth showing (no "0 поездок").
        const inhabited = facts.continents.filter((x) => (INHABITED_CONTINENTS as readonly string[]).includes(x)).length;
        tiles.push([`${inhabited}/6`, 'континентов']);
        if (facts.trips > 0) tiles.push([String(facts.trips), plural(facts.trips, 'поездка', 'поездки', 'поездок')]);
        if (facts.routeKm > 0) tiles.push([`${Math.round(facts.routeKm / 1000).toLocaleString('ru-RU')} тыс.`, 'км по маршрутам']);
        if (world.plannedCountryIds.size > 0) tiles.push([String(world.plannedCountryIds.size), plural(world.plannedCountryIds.size, 'страна в планах', 'страны в планах', 'стран в планах')]);
        if (facts.countriesThisYear > 0) tiles.push([String(facts.countriesThisYear), `${plural(facts.countriesThisYear, 'страна', 'страны', 'стран')} за ${new Date().getFullYear()} год`]);
        if (facts.topCountry && facts.topCountry.cities > 0) tiles.push([String(facts.topCountry.cities), `${plural(facts.topCountry.cities, 'город', 'города', 'городов')}: ${countryName(facts.topCountry.id)}`]);
      }
      if (fact) {
        ctx.fillStyle = ink;
        ctx.font = '600 38px Onest, system-ui, sans-serif';
        ctx.fillText(fit(ctx, fact, w - pad * 2), pad, y);
        y += story ? 60 : 50;
      }

      // Tiles: always full rows.
      const cols = 2;
      const gap = 24;
      const tw = (w - pad * 2 - gap) / cols;
      const th = story ? 190 : 150;
      const footerTop = h - (story ? 150 : 130);
      const rows = Math.max(0, Math.min(2, Math.floor((footerTop - y + gap) / (th + gap)), Math.floor(tiles.length / cols)));
      tiles.slice(0, rows * cols).forEach(([v, label], i) => {
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
        ctx.fillText(v, x + 34, ty + th * 0.47);
        ctx.fillStyle = ink2;
        ctx.font = '500 32px Onest, system-ui, sans-serif';
        ctx.fillText(fit(ctx, label, tw - 68), x + 34, ty + th - 34);
      });

      // Footer
      const now = new Date();
      ctx.fillStyle = ink2;
      ctx.font = '500 30px Onest, system-ui, sans-serif';
      ctx.fillText(`${MONTHS[now.getMonth()]} ${now.getFullYear()}`, pad, h - 90);

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
  }, [format, look, showStatus, progress, facts, world, settings.name, toast, scope, home, homeReady, hs]);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const share = async () => {
    const b = blob.current;
    if (!b) return;
    const homeCard = scope === 'home' && home;
    const file = new File([b], homeCard ? `myworld-${home}-${hs.opened}-regions.png` : `myworld-${progress.visited}-countries.png`, { type: 'image/png' });
    const text = homeCard
      ? hs.total > 0
        ? `${countryName(home)}: ${hs.opened} из ${hs.total} ${plural(hs.total, 'региона', 'регионов', 'регионов')}, ${hs.visited.length} ${plural(hs.visited.length, 'город', 'города', 'городов')}`
        : `${countryName(home)}: ${hs.visited.length} ${plural(hs.visited.length, 'город', 'города', 'городов')}`
      : `${progress.visited} ${plural(progress.visited, 'страна', 'страны', 'стран')} и ${progress.percent}% мира`;
    const data = { files: [file], title: 'MY WORLD', text };
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
      {home && (
        <Segmented
          label="Что показать"
          className="share-scope"
          value={scope}
          onChange={setScope}
          options={[
                  { value: 'world', label: 'Мой мир', icon: 'globe' },
            { value: 'home', label: countryName(home), icon: 'home' },
          ]}
        />
      )}
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
      <div className={`share-preview ${format}`}>{url ? <img src={url} alt={scope === 'home' ? 'Карточка с регионами и городами своей страны' : 'Карточка с количеством стран и городов'} /> : <span className="spinner" />}</div>
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
