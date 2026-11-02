import { geoAzimuthalEqualArea, geoCentroid, geoEqualEarth, geoPath } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useToast } from '../../app/toast';
import { setSetting, useWorld } from '../../app/world';
import { INHABITED_CONTINENTS } from '../../domain/achievements';
import { plural } from '../../domain/dates';
import { loadCountryShapes } from '../../geo/geometry';
import { countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Segmented, Sheet } from '../../ui/kit';
import { useFacts } from './useFacts';
import { useHobbyStats } from './useHobbyStats';
import { RIDER_FULL, RIDER_LABEL } from '../../domain/hobby';
import type { FactRow } from '../../domain/hobbyFacts';
import { clip, fitLines } from '../../domain/textLayout';
import { travelerStatus } from '../../domain/status';
import { useHomeCountry } from '../countries/HomeCountry';
import { useHomeStats } from '../countries/homeStats';

type Format = 'story' | 'square';
type Look = 'dark' | 'light';
/** What the card is about: the world (optionally with hobbies on it — one card for everything), the home country, or one hobby alone. */
type Scope = 'world' | 'home' | 'rider' | 'surf';
type FactScope = 'world' | 'rider' | 'surf';

const SIZE: Record<Format, [number, number]> = { story: [1080, 1920], square: [1080, 1350] };
const MAX_FACTS = 3;
const PICK_KEY = 'mw-share-picks';
const FONT = 'Onest, system-ui, sans-serif';
interface Picks {
  /** Facts drawn on the card per card kind (ids of FactRow), up to three. Missing — not chosen yet: a default. */
  facts: Partial<Record<FactScope, string[]>>;
  /** Hobbies added to the world card. */
  rider: boolean;
  surf: boolean;
}
const readPicks = (): Picks => {
  try {
    const v = JSON.parse(localStorage.getItem(PICK_KEY) ?? 'null') as { facts?: unknown; rider?: unknown; surf?: unknown } | null;
    const ids = (x: unknown) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === 'string') : undefined);
    const facts: Picks['facts'] = {};
    // Older copies kept one list for the world card.
    if (Array.isArray(v?.facts)) facts.world = ids(v.facts);
    else if (v?.facts && typeof v.facts === 'object') for (const k of ['world', 'rider', 'surf'] as const) { const l = ids((v.facts as Record<string, unknown>)[k]); if (l) facts[k] = l; }
    return { facts, rider: !!v?.rider, surf: !!v?.surf };
  } catch {
    return { facts: {}, rider: false, surf: false };
  }
};
const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
const pctText = (n: number) => String(n).replace('.', ',');
const thousandKm = (n: number) => `${String(Math.round(n / 100) / 10).replace('.', ',')} тыс. км`;

/** Story/post image with the user's travel stats, drawn on a canvas so it can be shared as a PNG. */
export function ShareCardSheet({ onClose }: { onClose: () => void }) {
  const { world, settings } = useWorld();
  const { progress, facts, travelRows } = useFacts();
  const hobby = useHobbyStats();
  const toast = useToast();
  const [picks, setPicksRaw] = useState<Picks>(readPicks);
  const setPicks = (p: Picks) => {
    setPicksRaw(p);
    try {
      localStorage.setItem(PICK_KEY, JSON.stringify(p));
    } catch {
      /* private mode */
    }
  };
  const rider = settings.riderType;
  const surfOn = settings.surf;
  const home = useHomeCountry();
  const [scopePick, setScope] = useState<Scope>('world');
  const scope: Scope = scopePick === 'home' ? (home ? 'home' : 'world') : scopePick === 'rider' ? (rider ? 'rider' : 'world') : scopePick === 'surf' ? (surfOn ? 'surf' : 'world') : 'world';
  const factScope: FactScope | null = scope === 'home' ? null : scope;
  const withRider = scope === 'world' && !!rider && picks.rider && hobby.resorts.length > 0;
  const withSurf = scope === 'world' && surfOn && picks.surf && hobby.spots.length > 0;
  const riderName = rider ? RIDER_LABEL[rider] : '';

  // Facts on offer for this card.
  const offer: Array<FactRow & { group: string }> =
    factScope === 'rider'
      ? hobby.riderRows.map((r) => ({ ...r, group: riderName }))
      : factScope === 'surf'
        ? hobby.surfRows.map((r) => ({ ...r, group: 'Сёрфинг' }))
        : factScope === 'world'
          ? [
              ...travelRows.map((r) => ({ ...r, group: 'Путешествия' })),
              ...(withRider ? hobby.riderRows.map((r) => ({ ...r, group: riderName })) : []),
              ...(withSurf ? hobby.surfRows.map((r) => ({ ...r, group: 'Сёрфинг' })) : []),
            ]
          : [];
  // Not chosen yet: travels — distance from home (or the northern point); a hobby — its first two facts.
  const fallback =
    factScope === 'world'
      ? [travelRows.find((r) => r.id === 't-far') ?? travelRows.find((r) => r.id === 't-north') ?? travelRows[0]].filter((r): r is FactRow => !!r).map((r) => r.id)
      : offer.filter((r) => r.id !== 'r-count' && r.id !== 's-count').slice(0, 2).map((r) => r.id);
  const pickedIds = (factScope && picks.facts[factScope]) ?? fallback;
  const chosen = offer.filter((r) => pickedIds.includes(r.id)).slice(0, MAX_FACTS);
  const toggleFact = (id: string) => {
    if (!factScope) return;
    const now = chosen.map((r) => r.id);
    setPicks({ ...picks, facts: { ...picks.facts, [factScope]: now.includes(id) ? now.filter((x) => x !== id) : [...now, id].slice(0, MAX_FACTS) } });
  };

  const riderTiles = (): Array<[string, string]> => {
    const t: Array<[string, string]> = [];
    const n = hobby.resorts.length;
    const c = new Set(hobby.resorts.map((r) => r.countryId)).size;
    const top = Math.max(0, ...hobby.resorts.map((r) => r.elevMax ?? 0));
    const done = hobby.riderAch.filter((a) => a.done).length;
    t.push([String(n), `${rider === 'ski' ? '⛷️' : '🏂'} ${plural(n, 'курорт', 'курорта', 'курортов')}`]);
    t.push([String(c), plural(c, 'страна с курортами', 'страны с курортами', 'стран с курортами')]);
    if (top > 0) t.push([`${top.toLocaleString('ru-RU')} м`, 'выше всего']);
    t.push([`${done}/${hobby.riderAch.length}`, 'достижений']);
    return t;
  };
  const surfTiles = (): Array<[string, string]> => {
    const t: Array<[string, string]> = [];
    const n = hobby.spots.length;
    const c = new Set(hobby.spots.map((r) => r.countryId)).size;
    const cont = new Set(hobby.spots.map((r) => r.continent).filter(Boolean)).size;
    const done = hobby.surfAch.filter((a) => a.done).length;
    t.push([String(n), `🏄 ${plural(n, 'спот', 'спота', 'спотов')}`]);
    t.push([String(c), plural(c, 'страна с волнами', 'страны с волнами', 'стран с волнами')]);
    if (cont > 0) t.push([String(cont), plural(cont, 'континент', 'континента', 'континентов')]);
    if (hobby.favourites > 0) t.push([String(hobby.favourites), 'в избранном']);
    t.push([`${done}/${hobby.surfAch.length}`, 'достижений']);
    return t;
  };
  const hobbyKey = `${hobby.resorts.map((r) => r.id).join()}|${hobby.spots.map((r) => r.id).join()}|${hobby.resortTotal}|${hobby.spotTotal}|${hobby.favourites}`;
  const chosenKey = `${chosen.map((r) => r.id).join()}|${withRider}|${withSurf}|${hobbyKey}`;
  const [format, setFormat] = useState<Format>('story');
  const [look, setLook] = useState<Look>('dark');
  const hs = useHomeStats(scope === 'home' ? home : null);
  // The country card waits for regions and the city catalog, so its numbers match «Моя страна».
  const homeReady = scope !== 'home' || (hs.regions !== null && (hs.local !== null || hs.failed));
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
      await Promise.all([document.fonts.load(`760 120px ${FONT}`), document.fonts.load(`250 120px ${FONT}`), document.fonts.load(`500 40px ${FONT}`), document.fonts.load(`600 40px ${FONT}`)]).catch(() => undefined);
      const shapes = await loadCountryShapes();
      const dark = look === 'dark';
      const ink = dark ? '#f2f2f4' : '#1b1b1f';
      const ink2 = dark ? 'rgba(242,242,244,0.62)' : 'rgba(27,27,31,0.6)';
      const lime = '#ddf36f';
      const off = dark ? 'rgba(255,255,255,0.13)' : 'rgba(27,27,31,0.12)';
      const measureAt = (weight: number) => (size: number) => {
        ctx.font = `${weight} ${size}px ${FONT}`;
        return (t: string) => ctx.measureText(t).width;
      };

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
      const textW = w - pad * 2;
      let y = story ? 170 : 120;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = ink2;
      ctx.font = `600 34px ${FONT}`;
      const brand =
        scope === 'home' && home ? `MY WORLD · ${countryName(home)}` : scope === 'rider' && rider ? `MY WORLD · ${RIDER_FULL[rider]}` : scope === 'surf' ? 'MY WORLD · Сёрфинг' : 'MY WORLD';
      ctx.fillText(clip(measureAt(600)(34), settings.name ? `${settings.name} · ${brand}` : brand, textW), pad, y);
      y += 54;
      if (showStatus && (scope === 'world' || scope === 'home')) {
        // The status is the owner's text and can be long: smaller font, then a second line — never cut.
        const st = travelerStatus(progress.visited).status;
        const sf = fitLines(measureAt(600), `${st.emoji} ${st.title}`, textW, [36, 32, 29], 2);
        ctx.fillStyle = ink;
        ctx.font = `600 ${sf.size}px ${FONT}`;
        const slh = Math.round(sf.size * 1.25);
        sf.lines.forEach((l, k) => ctx.fillText(l, pad, y + k * slh));
        y += (sf.lines.length - 1) * slh;
      }

      // ---- what the card says
      const homeId = scope === 'home' ? home : null;
      let bigN: string;
      let ofN: string | null;
      let line: string;
      let pct: number;
      let pctLabel: string;
      const lines: string[] = [];
      const tiles: Array<[string, string]> = [];
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
      } else if (scope === 'rider' || scope === 'surf') {
        const list = scope === 'rider' ? hobby.resorts : hobby.spots;
        const total = scope === 'rider' ? hobby.resortTotal : hobby.spotTotal;
        const countries = new Set(list.map((p) => p.countryId)).size;
        bigN = String(list.length);
        ofN = total ? `/${total}` : null;
        line = scope === 'rider'
          ? `${plural(list.length, 'курорт', 'курорта', 'курортов')} · ${countries} ${plural(countries, 'страна', 'страны', 'стран')}`
          : `${plural(list.length, 'спот', 'спота', 'спотов')} · ${countries} ${plural(countries, 'страна', 'страны', 'стран')}`;
        pct = total ? Math.round((list.length / total) * 1000) / 10 : 0;
        pctLabel = scope === 'rider' ? `${pctText(pct)}% курортов в каталоге` : `${pctText(pct)}% спотов в каталоге`;
        tiles.push(...(scope === 'rider' ? riderTiles() : surfTiles()).slice(2));
      } else {
        bigN = String(progress.visited);
        ofN = `/${progress.total}`;
        line = `${plural(progress.visited, 'страна', 'страны', 'стран')} · ${facts.cities} ${plural(facts.cities, 'город', 'города', 'городов')}`;
        pct = progress.percent;
        pctLabel = `${pctText(pct)}% мира исследовано`;
        // One card for everything: the hobbies' numbers go first.
        if (withRider) tiles.push(...riderTiles().slice(0, 2));
        if (withSurf) tiles.push(...surfTiles().slice(0, 2));
        const inhabited = facts.continents.filter((x) => (INHABITED_CONTINENTS as readonly string[]).includes(x)).length;
        tiles.push([`${inhabited}/6`, 'континентов']);
        if (facts.trips > 0) tiles.push([String(facts.trips), plural(facts.trips, 'поездка', 'поездки', 'поездок')]);
        if (facts.routeKm > 0) tiles.push([thousandKm(facts.routeKm).replace(' км', ''), 'км по маршрутам']);
        if (world.plannedCountryIds.size > 0) tiles.push([String(world.plannedCountryIds.size), plural(world.plannedCountryIds.size, 'страна в планах', 'страны в планах', 'стран в планах')]);
        if (facts.countriesThisYear > 0) tiles.push([String(facts.countriesThisYear), `${plural(facts.countriesThisYear, 'страна', 'страны', 'стран')} за ${new Date().getFullYear()} год`]);
        if (facts.topCountry && facts.topCountry.cities > 0) tiles.push([String(facts.topCountry.cities), `${plural(facts.topCountry.cities, 'город', 'города', 'городов')}: ${countryName(facts.topCountry.id)}`]);
      }
      if (homeId) {
        let top: { name: string; n: number } | null = null;
        for (const r of hs.regions ?? []) {
          const n = hs.openedRegions.get(r.properties.id) ?? 0;
          if (n > 1 && (!top || n > top.n)) top = { name: r.properties.ru, n };
        }
        const north = hs.visited.filter((v) => v.lat !== null).sort((a, b) => (b.lat as number) - (a.lat as number))[0];
        if (top) lines.push(`🏙 Больше всего городов — ${top.name}: ${top.n}`);
        else if (north && hs.visited.length > 1) lines.push(`🧭 Северная точка — ${north.name}, ${(north.lat as number).toFixed(0)}° с. ш.`);
        if (hs.local && hs.bigVisited !== null) tiles.push([`${hs.bigVisited}/${hs.local.big.length}`, 'крупных городов']);
        if (hs.local && hs.seatsVisited !== null && hs.local.seats.length > 0) tiles.push([`${hs.seatsVisited}/${hs.local.seats.length}`, 'центров регионов']);
        if (hs.total > 0) tiles.push([String(hs.total - hs.opened), `${plural(hs.total - hs.opened, 'регион', 'региона', 'регионов')} впереди`]);
        if (hs.total > 0) tiles.push([String(hs.visited.length), plural(hs.visited.length, 'город', 'города', 'городов')]);
      } else lines.push(...chosen.map((r) => `${r.icon} ${r.short ?? r.text}`));

      // ---- big counter, line, progress
      y += story ? 300 : 250;
      ctx.fillStyle = ink;
      ctx.font = `760 ${story ? 330 : 280}px ${FONT}`;
      ctx.fillText(bigN, pad - 12, y);
      const bw = ctx.measureText(bigN).width;
      if (ofN) {
        ctx.font = `250 ${story ? 120 : 100}px ${FONT}`;
        ctx.fillStyle = ink2;
        ctx.fillText(ofN, pad + bw, y);
      }
      y += story ? 80 : 70;
      ctx.fillStyle = ink;
      const lineFit = fitLines(measureAt(600), line, textW, [52, 46, 40], 1);
      ctx.font = `600 ${lineFit.size}px ${FONT}`;
      ctx.fillText(lineFit.lines[0] ?? '', pad, y);
      y += 54;
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.12)' : 'rgba(27,27,31,0.1)';
      roundRect(ctx, pad, y, textW, 26, 13);
      ctx.fill();
      ctx.fillStyle = lime;
      roundRect(ctx, pad, y, Math.max(26, (textW * pct) / 100), 26, 13);
      ctx.fill();
      y += 80;
      ctx.fillStyle = ink2;
      ctx.font = `500 38px ${FONT}`;
      ctx.fillText(pctLabel, pad, y);

      // ---- layout below: facts wrap (never cut), the map takes what is left
      const footerTop = h - (story ? 150 : 130);
      const gap = 24;
      const th = story ? 190 : 170;
      const factBlocks = lines.map((l) => {
        // Emoji in its own column, the text wraps under itself.
        const [icon, ...rest] = l.split(' ');
        const body = rest.join(' ');
        const f = fitLines(measureAt(600), body, textW - 60, story ? [38, 34, 31] : [34, 31, 28], 2);
        return { icon: icon ?? '', ...f, height: f.lines.length * Math.round(f.size * 1.3) };
      });
      const factGap = story ? 22 : 16;
      const factsH = factBlocks.reduce((s, b) => s + b.height, 0) + Math.max(0, factBlocks.length - 1) * factGap;
      const minTiles = tiles.length >= 2 ? th + gap : 0;
      const mapTop = y + (story ? 50 : 30);
      const afterMap = story ? 70 : 36;
      const room = footerTop - mapTop - afterMap - (factsH ? factsH + (story ? 44 : 30) : 0) - minTiles;
      const mapH = Math.max(story ? 300 : 220, Math.min(story ? 560 : 300, room));
      y = mapTop;

      // ---- map
      const box: [[number, number], [number, number]] = [
        [pad - 20, y],
        [w - pad + 20, y + mapH],
      ];
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
        const places = scope === 'rider' ? hobby.resorts : scope === 'surf' ? hobby.spots : [];
        const placeCountries = new Set(places.map((p) => p.countryId));
        for (const f of shapes.features) {
          if (f.properties.id === 'AQ') continue;
          ctx.beginPath();
          path(f);
          if (places.length || scope !== 'world') {
            // A hobby card: countries with visited places are tinted, the places themselves are dots.
            ctx.fillStyle = placeCountries.has(f.properties.id) ? (dark ? 'rgba(221,243,111,0.35)' : 'rgba(170,200,40,0.45)') : off;
            ctx.fill();
            continue;
          }
          const s = world.countryStatus.get(f.properties.id);
          ctx.fillStyle = s === 'visited' ? lime : off;
          ctx.fill();
          if (s === 'planned') {
            ctx.strokeStyle = ink2;
            ctx.lineWidth = 1.6;
            ctx.stroke();
          }
        }
        for (const p of places) {
          const pt = proj([p.lon, p.lat]);
          if (!pt) continue;
          ctx.beginPath();
          ctx.arc(pt[0], pt[1], 11, 0, Math.PI * 2);
          ctx.fillStyle = lime;
          ctx.fill();
          ctx.strokeStyle = dark ? '#0d0d0f' : '#1b1b1f';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
      y += mapH + afterMap;

      // ---- facts: emoji column + text wrapped to two lines (smaller font before anything is cut)
      for (const [i, b] of factBlocks.entries()) {
        const lh = Math.round(b.size * 1.3);
        ctx.font = `600 ${b.size}px ${FONT}`;
        ctx.fillStyle = ink;
        ctx.fillText(b.icon, pad, y + b.size);
        b.lines.forEach((l, k) => ctx.fillText(l, pad + 60, y + b.size + k * lh));
        y += b.height + (i < factBlocks.length - 1 ? factGap : 0);
      }
      if (factBlocks.length) y += story ? 44 : 30;

      // ---- tiles: always full rows; a long label wraps to two lines
      const cols = 2;
      const tw = (w - pad * 2 - gap) / cols;
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
        const vf = fitLines(measureAt(720), v, tw - 68, [64, 54, 46], 1);
        ctx.fillStyle = ink;
        ctx.font = `720 ${vf.size}px ${FONT}`;
        ctx.fillText(vf.lines[0] ?? v, x + 34, ty + 34 + vf.size * 0.85);
        const lf = fitLines(measureAt(500), label, tw - 68, [32, 28, 25], 2);
        ctx.fillStyle = ink2;
        ctx.font = `500 ${lf.size}px ${FONT}`;
        const llh = Math.round(lf.size * 1.2);
        lf.lines.forEach((l, k) => ctx.fillText(l, x + 34, ty + th - 30 - (lf.lines.length - 1 - k) * llh));
      });

      // Footer
      const now = new Date();
      ctx.fillStyle = ink2;
      ctx.font = `500 30px ${FONT}`;
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
  }, [format, look, showStatus, progress, facts, world, settings.name, toast, scope, home, homeReady, hs, chosenKey]);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const share = async () => {
    const b = blob.current;
    if (!b) return;
    const homeCard = scope === 'home' && home;
    const name = homeCard
      ? `myworld-${home}-${hs.opened}-regions.png`
      : scope === 'rider'
        ? `myworld-${hobby.resorts.length}-resorts.png`
        : scope === 'surf'
          ? `myworld-${hobby.spots.length}-spots.png`
          : `myworld-${progress.visited}-countries.png`;
    const file = new File([b], name, { type: 'image/png' });
    const text = homeCard
      ? hs.total > 0
        ? `${countryName(home)}: ${hs.opened} из ${hs.total} ${plural(hs.total, 'региона', 'регионов', 'регионов')}, ${hs.visited.length} ${plural(hs.visited.length, 'город', 'города', 'городов')}`
        : `${countryName(home)}: ${hs.visited.length} ${plural(hs.visited.length, 'город', 'города', 'городов')}`
      : scope === 'rider'
        ? `${hobby.resorts.length} ${plural(hobby.resorts.length, 'курорт', 'курорта', 'курортов')}`
        : scope === 'surf'
          ? `${hobby.spots.length} ${plural(hobby.spots.length, 'спот', 'спота', 'спотов')}`
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

  const scopes: Array<{ value: Scope; label: string; icon?: 'globe' | 'home' }> = [{ value: 'world', label: 'Мой мир', icon: 'globe' }];
  if (home) scopes.push({ value: 'home', label: countryName(home), icon: 'home' });
  if (rider) scopes.push({ value: 'rider', label: riderName });
  if (surfOn) scopes.push({ value: 'surf', label: 'Сёрфинг' });

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
      {scopes.length > 1 && <Segmented label="О чём карточка" className={`share-scope ${scopes.length > 2 ? 'many' : ''}`} value={scope} onChange={setScope} options={scopes} />}
      <div className="row wrap">
        <Segmented label="Формат" value={format} onChange={setFormat} options={[{ value: 'story', label: 'Сторис' }, { value: 'square', label: 'Пост' }]} />
        <Segmented label="Тема" value={look} onChange={setLook} options={[{ value: 'dark', label: 'Тёмная' }, { value: 'light', label: 'Светлая' }]} />
      </div>
      <div className="list">
        {(scope === 'world' || scope === 'home') && (
          <label className="list-row tap">
            <span className="grow">
              <span className="t">Статус на карточке</span>
              <span className="s block">
                {travelerStatus(progress.visited).status.emoji} {travelerStatus(progress.visited).status.title}
              </span>
            </span>
            <input type="checkbox" className="switch" checked={showStatus} onChange={(e) => void setSetting('shareStatus', e.target.checked)} />
          </label>
        )}
        {scope === 'world' && rider && (
          <label className="list-row tap">
            <span className="grow">
              <span className="t">Добавить {riderName.toLowerCase()}</span>
              <span className="s block">{hobby.resorts.length ? `Одна карточка для всего: + ${hobby.resorts.length} ${plural(hobby.resorts.length, 'курорт', 'курорта', 'курортов')}` : 'Пока нет курортов с отметкой «Был здесь»'}</span>
            </span>
            <input type="checkbox" className="switch" disabled={!hobby.resorts.length} checked={withRider} onChange={(e) => setPicks({ ...picks, rider: e.target.checked })} />
          </label>
        )}
        {scope === 'world' && surfOn && (
          <label className="list-row tap">
            <span className="grow">
              <span className="t">Добавить сёрфинг</span>
              <span className="s block">{hobby.spots.length ? `Одна карточка для всего: + ${hobby.spots.length} ${plural(hobby.spots.length, 'спот', 'спота', 'спотов')}` : 'Пока нет спотов с отметкой «Был здесь»'}</span>
            </span>
            <input type="checkbox" className="switch" disabled={!hobby.spots.length} checked={withSurf} onChange={(e) => setPicks({ ...picks, surf: e.target.checked })} />
          </label>
        )}
      </div>
      {factScope && offer.length > 0 && (
        <div className="stack tight">
          <div className="section-title">
            <h3 className="h3">Факты на карточке</h3>
            <span className="muted small num">
              {chosen.length} из {MAX_FACTS}
            </span>
          </div>
          <div className="share-facts">
            {offer.map((r, i) => (
              <Fragment key={r.id}>
                {(i === 0 || offer[i - 1]?.group !== r.group) && offer.some((x) => x.group !== offer[0]?.group) && <span className="share-facts-group faint tiny">{r.group}</span>}
                <button
                  type="button"
                  className="chip share-fact"
                  aria-pressed={chosen.some((c) => c.id === r.id)}
                  disabled={!chosen.some((c) => c.id === r.id) && chosen.length >= MAX_FACTS}
                  onClick={() => toggleFact(r.id)}
                >
                  <span aria-hidden="true">{r.icon}</span>
                  <span>{r.short ?? r.text}</span>
                </button>
              </Fragment>
            ))}
          </div>
        </div>
      )}
      {(scope === 'rider' || scope === 'surf') && (scope === 'rider' ? hobby.resorts.length : hobby.spots.length) === 0 && (
        <p className="faint small" style={{ margin: 0 }}>
          Отметьте «Был здесь» на {scope === 'rider' ? 'курортах' : 'спотах'} в «Мой мир» — они появятся на карточке.
        </p>
      )}
      <div className={`share-preview ${format}`}>{url ? <img src={url} alt="Карточка для соцсетей" /> : <span className="spinner" />}</div>
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
