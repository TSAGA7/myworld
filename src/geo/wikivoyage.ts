import type { Guide } from '../domain/model';

/** Sections of a Wikivoyage city article the guide keeps, with their Russian and English headings. */
export const GUIDE_SECTIONS: Array<{ key: string; title: string; match: RegExp }> = [
  { key: 'understand', title: 'О городе', match: /^(понять|understand)/i },
  { key: 'see', title: 'Что посмотреть', match: /^(достопримечательности|что посмотреть|see)/i },
  { key: 'do', title: 'Чем заняться', match: /^(чем заняться|развлечения|do)$/i },
  { key: 'eat', title: 'Где поесть', match: /^(еда|питание|где поесть|eat)/i },
  { key: 'drink', title: 'Вечером', match: /^(ночная жизнь|напитки|drink)/i },
  { key: 'getaround', title: 'Транспорт по городу', match: /^(транспорт|передвижение|get around)/i },
  { key: 'safe', title: 'Безопасность', match: /^(меры предосторожности|безопасность|stay safe)/i },
  { key: 'connect', title: 'Связь', match: /^(связь|connect)/i },
];

const ALLOWED = new Set(['P', 'UL', 'OL', 'LI', 'B', 'STRONG', 'I', 'EM', 'H3', 'H4', 'BR', 'DL', 'DT', 'DD']);
const MAX_SECTION = 9000;

/**
 * Rebuilds article HTML from an allow-list of tags: links become plain text, scripts, styles, images,
 * edit links and footnotes are dropped, and no attribute survives. The result is safe to render.
 */
function clean(node: Node, doc: Document): Node | null {
  if (node.nodeType === 3) return doc.createTextNode(node.textContent ?? '');
  if (node.nodeType !== 1) return null;
  const el = node as Element;
  if (el.matches('.mw-editsection, sup, style, script, figure, img, table, .noprint, .mw-empty-elt, .metadata, .thumb, .gallery, .mapframe, .mw-kartographer-container, .listing-metadata, .listing-coordinates')) return null;
  const tag = el.tagName === 'H5' || el.tagName === 'H6' ? 'H4' : el.tagName;
  const kids = [...el.childNodes].map((c) => clean(c, doc)).filter((c): c is Node => !!c);
  if (!ALLOWED.has(tag)) {
    const frag = doc.createDocumentFragment();
    kids.forEach((k) => frag.appendChild(k));
    return frag;
  }
  const out = doc.createElement(tag.toLowerCase());
  kids.forEach((k) => out.appendChild(k));
  return out;
}

const headingText = (el: Element): string | null => {
  const h = el.matches('h2') ? el : el.matches('.mw-heading2') ? el.querySelector('h2') : null;
  return h ? (h.textContent ?? '').replace(/\[[^\]]*\]/g, '').trim() : null;
};

export function parseWikivoyage(html: string, lang: string): { sections: Guide['sections']; places: Guide['places'] } {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, 'text/html');
  const root = doc.querySelector('.mw-parser-output') ?? doc.getElementById('root');
  if (!root) return { sections: [], places: [] };
  const groups: Array<{ heading: string; nodes: Element[] }> = [{ heading: '', nodes: [] }];
  for (const child of [...root.children]) {
    const h = headingText(child);
    if (h !== null) groups.push({ heading: h, nodes: [] });
    else groups[groups.length - 1]?.nodes.push(child);
  }
  const sections: Guide['sections'] = [];
  const places: Guide['places'] = [];
  const intro = groups[0];
  if (intro) {
    const ps = intro.nodes.filter((n) => n.tagName === 'P' && (n.textContent ?? '').trim().length > 40).slice(0, 2);
    const box = doc.createElement('div');
    ps.forEach((p) => {
      const c = clean(p, doc);
      if (c) box.appendChild(c);
    });
    if (box.innerHTML.trim()) sections.push({ key: 'intro', title: 'Коротко', html: box.innerHTML });
  }
  for (const g of groups.slice(1)) {
    const def = GUIDE_SECTIONS.find((s) => s.match.test(g.heading));
    if (!def || sections.some((s) => s.key === def.key)) continue;
    // Places with coordinates from listing templates.
    for (const n of g.nodes) {
      for (const v of n.querySelectorAll('.vcard, .listing')) {
        const name = (v.querySelector('.fn, .listing-name, b, strong')?.textContent ?? '').trim();
        const geo = v.querySelector('[data-lat][data-lon]');
        const lat = geo ? Number(geo.getAttribute('data-lat')) : Number(v.querySelector('.latitude')?.textContent);
        const lon = geo ? Number(geo.getAttribute('data-lon')) : Number(v.querySelector('.longitude')?.textContent);
        if (name && name.length < 80 && !places.some((p) => p.name === name)) {
          places.push({ name, kind: def.key, lat: Number.isFinite(lat) && lat !== 0 ? lat : null, lon: Number.isFinite(lon) && lon !== 0 ? lon : null });
        }
      }
    }
    const box = doc.createElement('div');
    for (const n of g.nodes) {
      const c = clean(n, doc);
      if (c) box.appendChild(c);
      if (box.innerHTML.length > MAX_SECTION) break;
    }
    // Drop empty paragraphs and list items left after cleaning.
    box.querySelectorAll('p, li').forEach((e) => {
      if (!(e.textContent ?? '').trim()) e.remove();
    });
    const text = box.innerHTML.trim();
    if (text) sections.push({ key: def.key, title: def.title, html: text });
  }
  void lang;
  return { sections, places: places.slice(0, 60) };
}
