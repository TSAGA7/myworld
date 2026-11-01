// Ski resorts catalog → <data>/catalog/resorts.json.
//
// Source: OpenSkiMap (© OpenStreetMap contributors, ODbL) — ski areas with run/lift statistics computed from OSM;
// Wikidata (CC0) — Russian name, Telegram channel (P3789), official site when OSM has none.
// Manual additions and fixes (cameras, Telegram, switching a resort off) — scripts/catalog/resorts-extra.json.
// Nothing is filled in by hand from memory: an empty field stays null and the app hides it.
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { APP, COUNTRY_IDS, OUT, UA, countryAt, getJson, readJson, regionAt, round, splitName, writeOut } from './common.mjs';

const SKI_AREAS = 'https://tiles.openskimap.org/geojson/ski_areas.geojson';
/** «Полноценный» курорт: столько км горнолыжных трасс и подъёмников (без бугелей-верёвок и травалаторов) — не меньше. */
const MIN = { default: { km: 10, lifts: 3 }, RU: { km: 4, lifts: 2 } };
const NOT_LIFTS = new Set(['rope_tow', 'magic_carpet', 'railway']);

const file = process.env.SKI_AREAS_FILE ?? join(tmpdir(), 'ski_areas.geojson');
if (!process.env.SKI_AREAS_FILE) {
  console.log('Загрузка', SKI_AREAS);
  const r = await fetch(SKI_AREAS, { headers: { 'user-agent': UA } });
  if (!r.ok || !r.body) throw new Error(`OpenSkiMap: HTTP ${r.status}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(file));
}
const fc = JSON.parse(await readFile(file, 'utf8'));
console.log('Зон катания в OpenSkiMap:', fc.features.length);

/** Centre of the area's bounding box. (d3 geoCentroid reads GeoJSON's counter-clockwise rings as «the rest of the globe»
 * and returned the antipode — Austrian resorts landed in the Pacific.) */
function centre(g) {
  if (!g) return [NaN, NaN];
  if (g.type === 'Point') return g.coordinates;
  const pts = g.type === 'Polygon' ? g.coordinates.flat() : g.type === 'MultiPolygon' ? g.coordinates.flat(2) : [];
  if (!pts.length) return [NaN, NaN];
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  return [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
}

const sum = (o, pick) => Object.entries(o ?? {}).reduce((s, [k, v]) => s + pick(k, v), 0);
const report = { generatedAt: new Date().toISOString(), source: SKI_AREAS, total: fc.features.length, skipped: {}, errors: [] };
const skip = (why) => (report.skipped[why] = (report.skipped[why] ?? 0) + 1);

let items = [];
for (const f of fc.features) {
  const p = f.properties ?? {};
  if (!p.name) { skip('без названия'); continue; }
  if (!p.activities?.includes('downhill')) { skip('не горнолыжный'); continue; }
  if (p.status && p.status !== 'operating') { skip('не работает'); continue; }
  const st = p.statistics;
  const km = sum(st?.runs?.byActivity?.downhill?.byDifficulty, (_k, v) => v?.lengthInKm ?? 0);
  const lifts = sum(st?.lifts?.byType, (k, v) => (NOT_LIFTS.has(k) ? 0 : (v?.count ?? 0)));
  const [lon, lat] = centre(f.geometry);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) { skip('без координат'); continue; }
  const iso = p.places?.[0]?.iso3166_1Alpha2;
  const countryId = (iso && COUNTRY_IDS.has(iso) ? iso : null) ?? countryAt(lon, lat);
  if (!countryId) { skip('страна не определена'); continue; }
  const min = MIN[countryId] ?? MIN.default;
  if (km < min.km || lifts < min.lifts) { skip('маленький склон'); continue; }
  const src = p.sources ?? [];
  const ids = [
    p.wikidataID ? `wd-${p.wikidataID}` : null,
    ...src.filter((s) => s.type === 'skimap.org').map((s) => `skimap-${s.id}`),
    ...src.filter((s) => s.type === 'openstreetmap').map((s) => `osm-${String(s.id).replace('/', '-')}`),
  ].filter(Boolean);
  if (!ids.length) { skip('без идентификатора'); continue; }
  const minE = st?.minElevation ?? st?.runs?.minElevation ?? null;
  const maxE = st?.maxElevation ?? st?.runs?.maxElevation ?? null;
  const nm = splitName(p.name);
  items.push({
    id: ids[0],
    alt: ids.slice(1),
    wd: p.wikidataID ?? null,
    name: nm.name,
    nameRu: nm.ru && nm.ru !== nm.name ? nm.ru : null,
    countryId,
    region: regionAt(countryId, lon, lat),
    lat: round(lat, 4),
    lon: round(lon, 4),
    pisteKm: round(km, 0) || null,
    lifts: lifts || null,
    elevMin: round(minE),
    elevMax: round(maxE),
    website: p.websites?.[0] ?? null,
    telegram: null,
    cams: [],
    active: true,
  });
}

// One resort mapped several times (OSM areas of one skimap.org resort, an OSM area + a skimap point that failed to merge,
// the same Wikidata item): everything that shares any id — or has the same name within 5 km — is one resort.
// The biggest part keeps its data; the other ids become `alt`, so every id stays unique.
const near = (a, b) => Math.abs(a.lat - b.lat) < 0.05 && Math.abs(a.lon - b.lon) < 0.07;
items.sort((a, b) => (b.pisteKm ?? 0) - (a.pisteKm ?? 0));
const owner = new Map();
const kept = [];
for (const it of items) {
  const all = [it.id, ...it.alt];
  const byId = all.map((id) => owner.get(id)).find(Boolean);
  const dup = byId ?? kept.find((k) => near(k, it) && (k.name.toLowerCase() === it.name.toLowerCase() || (!!k.nameRu && k.nameRu === it.nameRu)));
  if (dup) {
    for (const id of all) if (!owner.has(id)) { owner.set(id, dup); dup.alt.push(id); }
    if (!dup.wd && it.wd) dup.wd = it.wd;
    if (!dup.nameRu && it.nameRu) dup.nameRu = it.nameRu;
    if (!dup.website && it.website) dup.website = it.website;
    skip('дубль');
    continue;
  }
  for (const id of all) owner.set(id, it);
  kept.push(it);
}
items = kept;
for (const it of items) it.alt = [...new Set(it.alt)].filter((x) => x !== it.id);

// Wikidata: Russian name, Telegram, official site.
const wds = [...new Set(items.map((i) => i.wd).filter(Boolean))];
const wdInfo = new Map();
for (let i = 0; i < wds.length; i += 250) {
  const values = wds.slice(i, i + 250).map((q) => `wd:${q}`).join(' ');
  const q = `SELECT ?item ?ru ?tg ?site WHERE { VALUES ?item { ${values} } OPTIONAL { ?item rdfs:label ?ru FILTER(LANG(?ru) = "ru") } OPTIONAL { ?item wdt:P3789 ?tg } OPTIONAL { ?item wdt:P856 ?site } }`;
  try {
    const j = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(q)}`, { headers: { accept: 'application/sparql-results+json' } });
    for (const b of j.results.bindings) {
      const id = b.item.value.split('/').pop();
      const cur = wdInfo.get(id) ?? {};
      wdInfo.set(id, { ru: cur.ru ?? b.ru?.value ?? null, tg: cur.tg ?? b.tg?.value ?? null, site: cur.site ?? b.site?.value ?? null });
    }
  } catch (e) {
    report.errors.push(`Wikidata: ${e.message}`);
  }
}
for (const it of items) {
  const w = it.wd ? wdInfo.get(it.wd) : null;
  if (!w) continue;
  if (w.ru && !it.nameRu && w.ru !== it.name) it.nameRu = w.ru;
  if (w.tg) {
    it.telegram = String(w.tg).replace(/^@/, '');
    it.tgSource = 'wikidata';
  }
  if (!it.website && w.site) it.website = w.site;
}

// Keep ids stable between builds: a resort that got a Wikidata id keeps the id the app already stored visits under.
const prev = readJson(join(OUT, 'resorts.json'))?.items ?? [];
const prevBy = new Map();
for (const p of prev) for (const id of [p.id, ...(p.alt ?? [])]) prevBy.set(id, p.id);
const taken = new Set(items.map((i) => i.id));
for (const it of items) {
  const old = [it.id, ...it.alt].map((id) => prevBy.get(id)).find(Boolean);
  if (old && old !== it.id && !taken.has(old)) {
    taken.delete(it.id);
    taken.add(old);
    it.alt = [...new Set([it.id, ...it.alt])].filter((x) => x !== old);
    it.id = old;
  }
}

// Manual layer: fixes, Telegram channels, cameras, switched-off resorts, resorts OSM lacks.
const extra = readJson(join(APP, 'scripts/catalog/resorts-extra.json'), { items: [] });
for (const e of extra.items ?? []) {
  const hit = items.find((i) => i.id === e.id || i.alt.includes(e.id));
  if (hit) Object.assign(hit, { ...e, id: hit.id }, e.telegram ? { tgSource: 'official' } : {});
  else if (e.name && Number.isFinite(e.lat) && Number.isFinite(e.lon) && e.countryId) items.push({ alt: [], wd: null, nameRu: null, region: regionAt(e.countryId, e.lon, e.lat), pisteKm: null, lifts: null, elevMin: null, elevMax: null, website: null, telegram: null, cams: [], active: true, ...e });
  else report.errors.push(`resorts-extra: не найден ${e.id}`);
}

for (const it of items) delete it.wd;
const seenIds = new Set();
items = items.filter((i) => !seenIds.has(i.id) && seenIds.add(i.id));
items.sort((a, b) => a.countryId.localeCompare(b.countryId) || a.name.localeCompare(b.name));
report.published = items.length;
report.byCountry = Object.fromEntries([...items.reduce((m, i) => m.set(i.countryId, (m.get(i.countryId) ?? 0) + 1), new Map())].sort((a, b) => b[1] - a[1]));
writeOut('resorts.json', { generatedAt: report.generatedAt, attribution: 'OpenSkiMap / © OpenStreetMap contributors (ODbL), Wikidata', items });
writeOut('resorts-report.json', report);
console.log(`Опубликовано курортов: ${items.length}`, JSON.stringify(report.skipped));
