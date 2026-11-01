/**
 * The saved guide HTML (allow-listed tags, see geo/wikivoyage.ts) as typed blocks: the app renders them as cards
 * and the PDF export draws the very same blocks, so both look alike.
 * Older guides stored listings as one run-on paragraph («…цветами.2 Кинотеатр «Москва»…») — those are split back
 * into numbered places here.
 */
export type GuideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'li'; text: string }
  | { kind: 'place'; n: number | null; name: string; info: string; text: string };

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

const ABBR = /(?:^|\s)(ул|пр|просп|пл|пер|бул|наб|д|г|стр|корп|им|св|st|ave|rd)\.$/i;
/** Address («ул. …», «пр. …»), phone («(010) 52…», «+374…») or opening hours («10:00–18:00»). */
const isInfo = (s: string): boolean =>
  /^(ул\.|пр\.|просп|пл\.|пер\.|бул\.|наб\.|шоссе|\+?\(?\d[\d\s()-]{4,}$)/i.test(s) || /\d{1,2}[:.]\d{2}\s*[–-]\s*\d/.test(s) || /\b(street|avenue|road|st\.)/i.test(s);

/** Text up to the first full stop that ends a sentence (not «ул.» or «пр.»). */
function firstSentence(s: string): string {
  for (let i = s.indexOf('.'); i >= 0; i = s.indexOf('.', i + 1)) {
    if (ABBR.test(s.slice(0, i + 1))) continue;
    if (i === s.length - 1 || s[i + 1] === ' ') return s.slice(0, i + 1);
  }
  return s;
}

/** "Кинотеатр «Москва», ул. Абовяна, 18. (010) 521210. Один из лучших…" → name / info / text. */
export function splitPlace(raw: string, n: number | null): GuideBlock {
  const s = clean(raw);
  const m = s.match(/^(.{2,80}?)(?:\s*[—–-]\s+|[,.]\s+|$)/);
  const name = (m?.[1] ?? s).trim();
  let rest = s.slice(m?.[0].length ?? s.length).trim();
  // Short leading sentences with digits or street words are the address, phone and hours.
  const info: string[] = [];
  for (;;) {
    const seg = firstSentence(rest);
    if (!seg || !isInfo(seg.replace(/\.$/, '')) || seg.split(' ').length > 9) break;
    info.push(seg.replace(/\.$/, '').trim());
    rest = rest.slice(seg.length).trim();
  }
  return { kind: 'place', n, name, info: info.join(' · '), text: rest };
}

const NUMBERED = /^(\d{1,2})\s+(?=\S)/;

/** Splits a paragraph that is really «1 Место… 2 Место…» into places; other paragraphs stay as they are. */
function paragraph(text: string): GuideBlock[] {
  const t = clean(text);
  if (!t) return [];
  const parts = t.split(/(?<=[.!?»)])\s*(?=\d{1,2}\s+[«"A-ZА-ЯЁ])/);
  if (!NUMBERED.test(t) || parts.length < 2) return [{ kind: 'p', text: t }];
  return parts.map((p) => {
    const m = p.match(NUMBERED);
    return splitPlace(m ? p.slice(m[0].length) : p, m ? Number(m[1]) : null);
  });
}

export function guideBlocks(html: string): GuideBlock[] {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const out: GuideBlock[] = [];
  const walk = (el: Element) => {
    for (const node of [...el.childNodes]) {
      if (node.nodeType === 3) {
        out.push(...paragraph(node.textContent ?? ''));
        continue;
      }
      if (node.nodeType !== 1) continue;
      const e = node as Element;
      const tag = e.tagName;
      const text = e.textContent ?? '';
      if (tag === 'H3' || tag === 'H4' || tag === 'DT') {
        if (clean(text)) out.push({ kind: 'h', text: clean(text) });
      } else if (tag === 'UL' || tag === 'OL' || tag === 'DL' || tag === 'DIV') walk(e);
      else if (tag === 'LI') {
        const t = clean(text);
        const m = t.match(NUMBERED);
        // A listing: «Name — description» or «Name, address. …»; a plain list item otherwise.
        if (m || /^[^.]{2,70}?(\s[—–-]\s|,\s)/.test(t)) out.push(splitPlace(m ? t.slice(m[0].length) : t, m ? Number(m[1]) : null));
        else if (t) out.push({ kind: 'li', text: t });
      } else out.push(...paragraph(text));
    }
  };
  walk(doc.body.firstElementChild as Element);
  // Number unnumbered places in order, like the markers on the Wikivoyage map.
  let n = 0;
  return out.map((b) => (b.kind === 'place' ? { ...b, n: b.n ?? ++n } : b)).map((b) => (b.kind === 'place' && b.n !== null ? ((n = Math.max(n, b.n)), b) : b));
}
