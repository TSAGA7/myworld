// Online cameras of ski resorts → `cams` of catalog/resorts.json (+ catalog/webcams-report.json).
//
// Only the resort's OWN website is searched: its home page links to its webcam page (by the link text or address);
// that page is looked through for a live stream (.m3u8 — kind 'hls') or a refreshing snapshot (webcam image — kind 'image').
// Whatever is found is published as the official page ('link') plus the stream / snapshot when there is one.
// Nothing is taken from third-party camera aggregators; protected pages are not bypassed.
import { join } from 'node:path';
import { OUT, UA, readJson, sleep, writeOut } from './common.mjs';

const file = join(OUT, 'resorts.json');
const cat = readJson(file);
if (!cat) {
  console.log('Нет resorts.json — пропуск');
  process.exit(0);
}
const LIMIT = Number(process.env.WEBCAM_LIMIT ?? 260);
const CAM_LINK = /(web-?cam|webcams?|live-?cam|veb-?kam|kamer|камер|cameras?)/i;

async function get(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA.replace('MyWorldCatalog/1.0', 'Mozilla/5.0 (compatible; MyWorldCatalog/1.0)'), accept: 'text/html,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(15_000) });
  const type = r.headers.get('content-type') ?? '';
  const body = type.includes('html') ? await r.text() : '';
  return { ok: r.ok, status: r.status, url: r.url, body, xfo: r.headers.get('x-frame-options'), csp: r.headers.get('content-security-policy') };
}

/** Links of a page with their text. */
function links(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"#]+)"[^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    try {
      const url = new URL(m[1].replace(/&amp;/g, '&'), base).href;
      const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      out.push({ url, text });
    } catch {
      /* bad href */
    }
  }
  return out;
}
const sameSite = (a, b) => {
  const h = (u) => new URL(u).hostname.replace(/^www\./, '').split('.').slice(-2).join('.');
  try {
    return h(a) === h(b);
  } catch {
    return false;
  }
};

// Russian resorts first, then the biggest ones elsewhere.
const queue = cat.items
  .filter((r) => r.active !== false && r.website)
  .sort((a, b) => Number(b.countryId === 'RU') - Number(a.countryId === 'RU') || (b.pisteKm ?? 0) - (a.pisteKm ?? 0))
  .slice(0, LIMIT);
const report = { generatedAt: new Date().toISOString(), checked: 0, found: [], errors: [] };

for (const r of queue) {
  report.checked++;
  try {
    const home = await get(r.website);
    if (!home.ok || !home.body) throw new Error(`главная: HTTP ${home.status}`);
    const cand = links(home.body, home.url).filter((l) => sameSite(l.url, home.url) && (CAM_LINK.test(l.text) || CAM_LINK.test(new URL(l.url).pathname)));
    const page = cand[0];
    if (!page) continue;
    const p = await get(page.url);
    if (!p.ok) throw new Error(`камеры: HTTP ${p.status}`);
    const cams = [{ name: 'Камеры курорта', place: null, url: p.url, kind: 'link' }];
    const hls = [...new Set([...p.body.matchAll(/https?:\/\/[^"'\s<>]+?\.m3u8[^"'\s<>]*/gi)].map((m) => m[0]))].slice(0, 6);
    hls.forEach((u, i) => cams.push({ name: hls.length > 1 ? `Трансляция ${i + 1}` : 'Трансляция', place: null, url: u, kind: 'hls' }));
    if (!hls.length) {
      const imgs = [...new Set([...p.body.matchAll(/(?:src|data-src)="([^"]+?(?:webcam|cam)[^"]*?\.jpe?g[^"]*)"/gi)].map((m) => new URL(m[1].replace(/&amp;/g, '&'), p.url).href))].slice(0, 6);
      imgs.forEach((u, i) => cams.push({ name: imgs.length > 1 ? `Камера ${i + 1}` : 'Камера', place: null, url: u, kind: 'image' }));
    }
    // Manual cameras (resorts-extra.json) stay; found ones are added after them.
    const manual = (r.cams ?? []).filter((c) => !c.auto);
    r.cams = [...manual, ...cams.filter((c) => !manual.some((m) => m.url === c.url)).map((c) => ({ ...c, auto: true }))];
    report.found.push({ id: r.id, name: r.nameRu ?? r.name, page: p.url, hls: hls.length, images: cams.filter((c) => c.kind === 'image').length, embeddable: !p.xfo && !/frame-ancestors/i.test(p.csp ?? '') });
  } catch (e) {
    report.errors.push(`${r.nameRu ?? r.name}: ${e.message}`);
  }
  await sleep(300);
}

writeOut('resorts.json', cat);
writeOut('webcams-report.json', report);
console.log(`Камеры: проверено ${report.checked}, найдено у ${report.found.length}`);
for (const f of report.found) console.log(`  ${f.name}: ${f.page} · потоков ${f.hls}, снимков ${f.images}`);
