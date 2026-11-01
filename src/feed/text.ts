import type { NewsItem, Tag } from './schema.ts';

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', hellip: '…' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** HTML fragment → plain text with line breaks kept. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|blockquote|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(text)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const cut = (s: string, max: number): string => {
  if (s.length <= max) return s;
  const part = s.slice(0, max);
  const at = Math.max(part.lastIndexOf(' '), max - 20);
  return `${part.slice(0, at).replace(/[\s,.;:—–-]+$/, '')}…`;
};

/** Title = first meaningful line, the rest goes to a short excerpt. */
export function splitPost(text: string, maxTitle = 140, maxText = 320): { title: string; text: string } {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !/^(#\S+\s*)+$/.test(l) && !/^@\w+$/.test(l));
  const first = lines[0] ?? '';
  // A long first paragraph: its first sentence is the title.
  const sentence = first.length > maxTitle ? (first.match(/^.{20,}?[.!?](?=\s)/)?.[0] ?? first) : first;
  const title = cut(sentence, maxTitle);
  const rest = [first.slice(sentence.length).trim(), ...lines.slice(1)].filter(Boolean).join(' ');
  return { title, text: cut(rest, maxText) };
}

const NW = '(?<![а-яёa-z])';
const RULES: ReadonlyArray<[Tag, RegExp]> = [
  ['deal', /(\d[\d\s]*\s?(₽|р\.|руб|тыс\.? ?р)|скидк|распродаж|промокод|кэшбэк|\bOW\b|\bRT\b|горящ)/i],
  ['visa', /(виз[аыуе]|безвиз|въезд|границ|загранпаспорт|e-?visa|депортац)/i],
  ['air', /(авиа|рейс|аэропорт|перел[её]т|самол[её]т|\bS7\b|аэрофлот|«победа»|wizz|airlines|airways)/i],
  ['rail', new RegExp(`(поезд|${NW}ржд|ласточк|сапсан|электричк|${NW}ж/?д${NW.replace('<', '')}|вагон)`, 'i')],
  ['hotel', /(отел[ьеяи]|гостиниц|хостел|апартамент|airbnb)/i],
  ['rules', /(закон|правил[аоу]|штраф|туристическ\w* сбор|налог|tax\s?free|запрет|ограничени)/i],
];

export const tagsOf = (text: string): Tag[] => RULES.filter(([, re]) => re.test(text)).map(([t]) => t);

/** Word stems for near-duplicate detection: the same story retold by several channels. */
export function stems(text: string): Set<string> {
  const words = text.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я0-9]+/g) ?? [];
  return new Set(words.filter((w) => w.length > 3 || /^\d+$/.test(w)).map((w) => w.slice(0, 6)));
}

export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  // Overlap coefficient: a short retelling of a long post still matches.
  return common / Math.min(a.size, b.size);
}

/**
 * Merges retellings of one story into the earliest item (others go to `also`).
 * Items must be sorted newest first; comparison stays within 36 hours.
 */
export function dedupe(items: NewsItem[], threshold = 0.6): NewsItem[] {
  const out: Array<{ item: NewsItem; stems: Set<string>; t: number }> = [];
  const byTime = [...items].sort((a, b) => a.at.localeCompare(b.at));
  for (const it of byTime) {
    const s = stems(`${it.title} ${it.text}`);
    const t = Date.parse(it.at);
    const twin = s.size >= 6 ? out.find((o) => o.item.sourceId !== it.sourceId && Math.abs(o.t - t) < 36 * 3600e3 && similarity(o.stems, s) >= threshold) : undefined;
    if (twin) {
      if (!twin.item.also.some((x) => x.url === it.url)) twin.item = { ...twin.item, also: [...twin.item.also, { sourceId: it.sourceId, url: it.url }, ...it.also] };
    } else out.push({ item: { ...it }, stems: s, t });
  }
  return out.map((o) => o.item).sort((a, b) => b.at.localeCompare(a.at));
}
