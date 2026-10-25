// Builds the full city catalog, regions, airports and map labels from open data.
//
// Inputs (put them into CACHE, default .ne-cache/):
//   cities500.txt                      GeoNames (CC BY 4.0) — every place with 500+ people, ~200k entries
//   ne_10m_populated_places.geojson    Natural Earth — authoritative Russian names and ids of 7k cities
//   admin1-s.json                      Natural Earth 1:10m admin-1 regions, simplified with mapshaper:
//                                      mapshaper ne_10m_admin_1_states_provinces.geojson -filter-fields name,name_ru,iso_a2,adm0_a3,adm1_code,type_en
//                                      -simplify 4% keep-shapes -o admin1-s.json format=geojson precision=0.001
//   airports.csv                       OurAirports (public domain)
// Outputs:
//   public/data/cities.tsv             id ru en country lat lon pop region flags [aliases]
//   public/data/regions/<country>.json regions of each country (polygons, Russian names)
//   public/data/airports.json          IATA airports with city, coordinates and time zone
//   public/data/labels.json            capitals and big cities for map labels
//
// Usage: node scripts/build_world.mjs [cacheDir]
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { geoArea, geoBounds, geoContains } from 'd3-geo';
import { applyCityFixes } from './city-fixes.mjs';

const APP = dirname(dirname(new URL(import.meta.url).pathname));
const CACHE = process.argv[2] ?? join(APP, '.ne-cache');
const read = (f) => readFileSync(join(CACHE, f), 'utf8');

const countries = JSON.parse(readFileSync(join(APP, 'src/data/countries.json'), 'utf8'));
const shapes = JSON.parse(readFileSync(join(APP, 'public/data/countries.geojson'), 'utf8')).features;
const byIso2 = new Map(countries.filter((c) => c.iso2).map((c) => [c.iso2, c.id]));
byIso2.set('XK', 'XK');
const shapeBounds = shapes.map((f) => ({ f, b: geoBounds(f) }));
const inBounds = (b, lon, lat) => lat >= b[0][1] - 0.2 && lat <= b[1][1] + 0.2 && (b[0][0] <= b[1][0] ? lon >= b[0][0] - 0.2 && lon <= b[1][0] + 0.2 : lon >= b[0][0] || lon <= b[1][0]);
const countryAt = (lon, lat) => shapeBounds.find(({ f, b }) => inBounds(b, lon, lat) && geoContains(f, [lon, lat]))?.f.properties.id ?? null;

// ---------------------------------------------------------------- regions
const regionsByCountry = new Map();
for (const f of JSON.parse(read('admin1-s.json')).features) {
  const p = f.properties;
  const cid = byIso2.get(p.iso_a2) ?? countries.find((c) => c.iso3 === p.adm0_a3)?.id;
  if (!cid || !f.geometry) continue;
  // d3 wants clockwise outer rings; mapshaper writes counter-clockwise ones. A polygon bigger than a hemisphere is inverted.
  const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of rings) {
    const part = { type: 'Polygon', coordinates: poly };
    if (geoArea(part) > 2 * Math.PI) poly.forEach((ring) => ring.reverse());
  }
  const list = regionsByCountry.get(cid) ?? [];
  const nm = p.name_ru || p.name || p.adm1_code || '—';
  list.push({ f, b: geoBounds(f), ru: nm, en: p.name || nm, kind: p.type_en ?? '' });
  regionsByCountry.set(cid, list);
}
// Natural Earth quirks: placeholder polygons ("RUS+99?"), one region split in parts ("Cebu" twice) and several regions
// sharing a stale Russian name (Latvian municipalities all called «Валмиера»).
const RU_FIX = {
  'RU|Crimea': 'Крым', 'UA|Crimea': 'Крым', 'RU|Altay': 'Алтайский край', 'RU|Gorno-Altay': 'Республика Алтай', 'UA|Kiev': 'Киевская область', 'UA|Kiev City': 'Киев',
  'AR|Buenos Aires': 'Провинция Буэнос-Айрес', 'AR|Ciudad de Buenos Aires': 'Буэнос-Айрес', 'PE|Lima Province': 'Провинция Лима',
  'LA|Vientiane [prefecture]': 'Вьентьян (столичная префектура)', 'LA|Vientiane': 'Провинция Вьентьян',
};
const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
for (const [cid, list] of regionsByCountry) {
  const merged = [];
  const byEn = new Map();
  for (const r of list) {
    if (/\+99\?|^Neutral Zone$/.test(r.ru)) continue;
    const key = `${plain(r.en)}|${r.ru}`;
    const twin = byEn.get(key);
    if (twin) {
      const polys = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
      twin.f = { ...twin.f, geometry: { type: 'MultiPolygon', coordinates: [...polys(twin.f.geometry), ...polys(r.f.geometry)] } };
      twin.b = geoBounds(twin.f);
      continue;
    }
    byEn.set(key, r);
    merged.push(r);
  }
  const count = new Map();
  for (const r of merged) count.set(r.ru, (count.get(r.ru) ?? 0) + 1);
  for (const r of merged) {
    const fix = RU_FIX[`${cid}|${r.en}`];
    if (fix) r.ru = fix;
    else if ((count.get(r.ru) ?? 0) > 1) r.ru = r.en;
  }
  regionsByCountry.set(cid, merged);
}
rmSync(join(APP, 'public/data/regions'), { recursive: true, force: true });
mkdirSync(join(APP, 'public/data/regions'), { recursive: true });
for (const [cid, list] of regionsByCountry) {
  list.sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
  list.forEach((r, i) => (r.id = `${cid}-${i}`));
  const fc = { type: 'FeatureCollection', features: list.map((r) => ({ type: 'Feature', properties: { id: r.id, ru: r.ru, en: r.en }, geometry: r.f.geometry })) };
  writeFileSync(join(APP, 'public/data/regions', `${cid}.json`), JSON.stringify(fc));
}
const regionNames = {};
for (const list of regionsByCountry.values()) for (const r of list) regionNames[r.id] = r.ru;
writeFileSync(join(APP, 'public/data/region-names.json'), JSON.stringify(regionNames));
const regionAt = (cid, lon, lat) => {
  const list = regionsByCountry.get(cid);
  if (!list) return '';
  const hit = list.find((r) => inBounds(r.b, lon, lat) && geoContains(r.f, [lon, lat]));
  if (hit) return hit.id;
  // Coastal towns can fall just outside simplified borders: take the nearest region centre within ~50 km.
  let best = '';
  let bestD = 0.5;
  for (const r of list) {
    const cx = (r.b[0][0] + r.b[1][0]) / 2;
    const cy = (r.b[0][1] + r.b[1][1]) / 2;
    if (lon < r.b[0][0] - bestD || lon > r.b[1][0] + bestD || lat < r.b[0][1] - bestD || lat > r.b[1][1] + bestD) continue;
    const d = Math.hypot(lon - cx, lat - cy) / Math.max(1, Math.hypot(r.b[1][0] - r.b[0][0], r.b[1][1] - r.b[0][1]));
    if (d < bestD) {
      bestD = d;
      best = r.id;
    }
  }
  return best;
};

// ---------------------------------------------------------------- Natural Earth cities (Russian names, legacy ids)
const ne = new Map();
for (const f of JSON.parse(read('ne_10m_populated_places.geojson')).features) {
  const p = f.properties;
  ne.set(String(p.GEONAMESID), p);
}

// ---------------------------------------------------------------- GeoNames
// Russian alphabet only: Tatar, Kazakh, Ukrainian etc. spellings («Акмәсҗит») are not Russian names.
const CYR = /^[А-Яа-яЁё\s.\-'’()0-9]+$/;
const NOT_RU = /[іїєґўІЇЄҐЎђјљњћџЂЈЉЊЋЏѓќѕ]/;
function russianName(alt) {
  const cands = alt.split(',').filter((s) => CYR.test(s) && /[А-Яа-яЁё]/.test(s) && !NOT_RU.test(s));
  if (!cands.length) return null;
  return cands.find((s) => s.includes('ё')) ?? cands[0];
}
const rows = [];
const usedNe = new Set();
const tzPoints = [];
let n = 0;
for (const line of read('cities500.txt').split('\n')) {
  if (!line) continue;
  const c = line.split('\t');
  const [gid, name, , alt, lat, lon, , fcode, cc, , , , , , pop, , , tz] = c;
  if (fcode === 'PPLX' || fcode === 'PPLH' || fcode === 'PPLQ' || fcode === 'PPLW') continue; // sections, historical, abandoned
  const la = +lat;
  const lo = +lon;
  let cid = byIso2.get(cc) ?? null;
  if (!cid || !countries.some((x) => x.id === cid)) cid = countryAt(lo, la);
  if (!cid) continue;
  // Natural Earth sometimes points at a namesake in another country: only trust the link within one country.
  const cand = ne.get(gid);
  const nep = cand && (cand.ISO_A2 === cc || byIso2.get(cand.ISO_A2) === cid) ? cand : undefined;
  if (nep) usedNe.add(String(nep.NE_ID));
  const id = nep ? `ne:${nep.NE_ID}` : `gn:${gid}`;
  const ru = (nep && nep.NAME_RU) || russianName(alt) || name;
  const flags = fcode === 'PPLC' || (nep && nep.FEATURECLA === 'Admin-0 capital') ? 1 : fcode === 'PPLA' ? 2 : 0;
  rows.push([id, ru, ru === name ? '' : name, cid, la.toFixed(4), lo.toFixed(4), +pop || 0, regionAt(cid, lo, la), flags]);
  tzPoints.push({ lat: la, lon: lo, tz, pop: +pop || 0, ru, en: name, cid });
  if (++n % 20000 === 0) console.log('cities', n);
}
// Natural Earth places without a GeoNames twin keep their old ids. When the same city exists in GeoNames
// (a few kilometres away, same country), that row takes the Natural Earth id and name instead of a duplicate.
const rowGrid = new Map();
for (const r of rows) {
  const k = `${r[3]}:${Math.round(+r[4] * 5)}:${Math.round(+r[5] * 5)}`;
  (rowGrid.get(k) ?? rowGrid.set(k, []).get(k)).push(r);
}
const twin = (cid, la, lo, pop) => {
  let best = null;
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++)
      for (const r of rowGrid.get(`${cid}:${Math.round(la * 5) + a}:${Math.round(lo * 5) + b}`) ?? []) {
        if (!String(r[0]).startsWith('gn:') || Math.hypot(+r[4] - la, +r[5] - lo) > 0.15) continue;
        if (pop > 50_000 && r[6] < pop / 10) continue;
        if (!best || r[6] > best[6]) best = r;
      }
  return best;
};
for (const p of ne.values()) {
  if (usedNe.has(String(p.NE_ID))) continue;
  const cidNe = byIso2.get(p.ISO_A2);
  const t = cidNe ? twin(cidNe, p.LATITUDE, p.LONGITUDE, p.POP_MAX || 0) : null;
  if (t) {
    t[0] = `ne:${p.NE_ID}`;
    if (p.NAME_RU) t[1] = p.NAME_RU;
    if (p.FEATURECLA === 'Admin-0 capital') t[8] = 1;
    continue;
  }
  const cid = byIso2.get(p.ISO_A2) ?? countryAt(p.LONGITUDE, p.LATITUDE);
  if (!cid) continue;
  rows.push([`ne:${p.NE_ID}`, p.NAME_RU || p.NAME, p.NAME_RU && p.NAME_RU !== p.NAME ? p.NAME : '', cid, p.LATITUDE.toFixed(4), p.LONGITUDE.toFixed(4), p.POP_MAX || 0, regionAt(cid, p.LONGITUDE, p.LATITUDE), p.FEATURECLA === 'Admin-0 capital' ? 1 : 0]);
}
rows.sort((a, b) => b[6] - a[6]);
const clean = (s) => String(s).replace(/[\t\n|]/g, ' ');
// Hand-fixed Russian names, search aliases (10th column) and places GeoNames lacks — scripts/city-fixes.mjs.
const fixed = applyCityFixes(rows.map((r) => r.map(clean)));
writeFileSync(join(APP, 'public/data/cities.tsv'), fixed.map((r) => r.join('\t').replace(/\t+$/, '')).join('\n'));
console.log('cities.tsv', rows.length);

// labels: capitals and cities over 500k
const labels = rows.filter((r) => r[8] === 1 || r[6] >= 500_000).map((r) => [r[0], r[1], +r[4], +r[5], r[6], r[8] === 1 ? 1 : 0]);
writeFileSync(join(APP, 'public/data/labels.json'), JSON.stringify(labels));
console.log('labels', labels.length);

// ---------------------------------------------------------------- airports
const grid = new Map();
const key = (la, lo) => `${Math.floor(la)}:${Math.floor(lo)}`;
for (const p of tzPoints) {
  const k = key(p.lat, p.lon);
  (grid.get(k) ?? grid.set(k, []).get(k)).push(p);
}
const nearest = (la, lo, maxKm = 45) => {
  let best = null;
  let bestScore = Infinity;
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++)
      for (const p of grid.get(key(la + a, lo + b)) ?? []) {
        const km = Math.hypot(p.lat - la, (p.lon - lo) * Math.cos((la * Math.PI) / 180)) * 111;
        if (km > maxKm) continue;
        const score = -p.pop; // the airport serves the biggest city around it
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }
  return best;
};
function parseCsv(text) {
  const out = [];
  let row = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(cur);
      cur = '';
    } else if (ch === '\n') {
      row.push(cur);
      out.push(row);
      row = [];
      cur = '';
    } else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) out.push([...row, cur]);
  return out;
}
const csv = parseCsv(read('airports.csv'));
const head = csv[0];
const col = (n) => head.indexOf(n);
const airports = [];
for (const r of csv.slice(1)) {
  const iata = r[col('iata_code')];
  const type = r[col('type')];
  if (!/^[A-Z]{3}$/.test(iata ?? '')) continue;
  if (!(type === 'large_airport' || type === 'medium_airport' || (type === 'small_airport' && r[col('scheduled_service')] === 'yes'))) continue;
  const la = +r[col('latitude_deg')];
  const lo = +r[col('longitude_deg')];
  const near = nearest(la, lo);
  const cid = byIso2.get(r[col('iso_country')]) ?? near?.cid ?? '';
  airports.push([iata, r[col('name')], near ? near.ru : r[col('municipality')], cid, +la.toFixed(4), +lo.toFixed(4), near?.tz ?? '', type === 'large_airport' ? 1 : 0]);
}
airports.sort((a, b) => b[7] - a[7] || a[0].localeCompare(b[0]));
writeFileSync(join(APP, 'public/data/airports.json'), JSON.stringify(airports));
console.log('airports', airports.length);
