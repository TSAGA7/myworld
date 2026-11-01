// Surf spots catalog → <data>/catalog/spots.json.
//
// The list of spots is scripts/catalog/spots-seed.json. Coordinates come from OpenStreetMap only:
//   1) a point tagged sport=surfing with this name in the country (Overpass);
//   2) otherwise an OSM search hit (Nominatim) inside the region of the spot.
// A spot not found either way is NOT published — it is listed in spots-report.json for a manual fix in spots-extra.json.
// Wave type, level and season are published only from spots-extra.json, where each value carries its source.
import { join } from 'node:path';
import { APP, COUNTRY_IDS, OUT, countryContinent, getJson, readJson, regionAt, round, sleep, slug, writeOut } from './common.mjs';

const seed = readJson(join(APP, 'scripts/catalog/spots-seed.json'));
const extra = readJson(join(APP, 'scripts/catalog/spots-extra.json'), { items: [] });
const prev = new Map((readJson(join(OUT, 'spots.json'))?.items ?? []).map((s) => [s.id, s]));
const report = { generatedAt: new Date().toISOString(), notFound: [], errors: [] };

const fold = (s) =>
  ` ${s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]s\b/g, 's')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9а-яё]+/g, ' ')
    .trim()} `;

let lastNominatim = 0;
async function nominatim(q, cc) {
  const wait = 1100 - (Date.now() - lastNominatim);
  if (wait > 0) await sleep(wait);
  lastNominatim = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&accept-language=en&countrycodes=${cc.toLowerCase()}&q=${encodeURIComponent(q)}`;
  return getJson(url);
}

const surfPoints = new Map();
async function surfPointsOf(cc) {
  if (!surfPoints.has(cc)) {
    const q = `[out:json][timeout:120];area["ISO3166-1"="${cc}"][admin_level=2]->.a;nwr["sport"="surfing"]["name"](area.a);out center tags;`;
    let list = [];
    try {
      const j = await getJson('https://overpass-api.de/api/interpreter', { method: 'POST', body: new URLSearchParams({ data: q }), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
      list = j.elements.map((e) => ({ osm: `${e.type}/${e.id}`, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, names: [e.tags.name, e.tags['name:en'], e.tags['name:ru']].filter(Boolean).map(fold) })).filter((p) => Number.isFinite(p.lat));
    } catch (e) {
      report.errors.push(`Overpass ${cc}: ${e.message}`);
    }
    surfPoints.set(cc, list);
    await sleep(2000);
  }
  return surfPoints.get(cc);
}

const inBox = (b, lat, lon, pad = 0.5) => lat >= b[0] - pad && lat <= b[1] + pad && lon >= b[2] - pad && lon <= b[3] + pad;
const dist2 = (a, lat, lon) => (a.lat - lat) ** 2 + (a.lon - lon) ** 2;

const items = [];
for (const g of seed.spots) {
  if (!COUNTRY_IDS.has(g.c)) {
    report.errors.push(`Нет страны ${g.c}`);
    continue;
  }
  let anchor = null;
  try {
    const a = (await nominatim(g.near, g.c))[0];
    if (a) anchor = { lat: +a.lat, lon: +a.lon, box: a.boundingbox.map(Number) };
  } catch (e) {
    report.errors.push(`Якорь ${g.near}: ${e.message}`);
  }
  for (const raw of g.items) {
    const s = typeof raw === 'string' ? { name: raw } : raw;
    const id = `${g.c.toLowerCase()}-${slug(s.name)}`;
    const base = { id, name: s.name, countryId: g.c, continent: countryContinent.get(g.c) ?? null, group: g.region, area: !!s.area };
    const old = prev.get(id);
    let hit = old && Number.isFinite(old.lat) ? { lat: old.lat, lon: old.lon, osm: old.osm ?? null, by: old.by } : null;
    const q = s.q ?? s.name;
    if (!hit && !s.area) {
      const want = fold(q);
      const pts = (await surfPointsOf(g.c)).filter((p) => p.names.some((n) => n === want || n.includes(want)));
      const best = anchor ? pts.filter((p) => inBox(anchor.box, p.lat, p.lon)).sort((x, y) => dist2(anchor, x.lat, x.lon) - dist2(anchor, y.lat, y.lon))[0] : pts[0];
      if (best) hit = { lat: best.lat, lon: best.lon, osm: best.osm, by: 'osm-surf' };
    }
    if (!hit) {
      try {
        const res = await nominatim(s.area ? q : `${q}, ${g.near}`, g.c);
        const ok = res.find((r) => !anchor || inBox(anchor.box, +r.lat, +r.lon)) ?? (s.area ? null : (await nominatim(q, g.c)).find((r) => anchor && inBox(anchor.box, +r.lat, +r.lon)));
        if (ok) hit = { lat: +ok.lat, lon: +ok.lon, osm: ok.osm_type ? `${ok.osm_type}/${ok.osm_id}` : null, by: 'osm-search' };
      } catch (e) {
        report.errors.push(`Поиск ${s.name}: ${e.message}`);
      }
    }
    if (!hit) {
      report.notFound.push(`${g.c} · ${g.region} · ${s.name}`);
      continue;
    }
    items.push({ ...base, lat: round(hit.lat, 5), lon: round(hit.lon, 5), osm: hit.osm, by: hit.by, region: regionAt(g.c, hit.lon, hit.lat), wave: null, level: null, season: null, website: null, photo: null, src: null, active: true });
  }
}

for (const e of extra.items ?? []) {
  const hit = items.find((i) => i.id === e.id);
  if (hit) Object.assign(hit, e);
  else if (e.name && e.countryId && Number.isFinite(e.lat) && Number.isFinite(e.lon)) items.push({ continent: countryContinent.get(e.countryId) ?? null, group: null, area: false, osm: null, by: 'manual', region: regionAt(e.countryId, e.lon, e.lat), wave: null, level: null, season: null, website: null, photo: null, src: null, active: true, ...e });
  else report.errors.push(`spots-extra: не найден ${e.id}`);
}

report.published = items.length;
writeOut('spots.json', { generatedAt: report.generatedAt, attribution: '© OpenStreetMap contributors (ODbL)', items });
writeOut('spots-report.json', report);
console.log(`Опубликовано спотов: ${items.length}, не найдено: ${report.notFound.length}`);
for (const n of report.notFound) console.log('  не найден:', n);
for (const e of report.errors) console.log('  ошибка:', e);
