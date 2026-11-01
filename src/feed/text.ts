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
/** Frequent words that say nothing about which story it is (first 4 letters). */
const STOP = new Set(['котор', 'этом', 'будет', 'такж', 'може', 'стра', 'росс', 'тури', 'рейс', 'сего', 'тепе', 'новы', 'граж', 'врем', 'попу', 'назв', 'заяв', 'сооб', 'расс', 'стал', 'смог', 'пред', 'посл', 'боле', 'чтоб', 'года', 'туро'] .map((w) => w.slice(0, 4)));

/** Word stems (first 4 letters) for near-duplicate detection: "Индией" and "Индия" match. */
export function stems(text: string): Set<string> {
  const words = text.toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я0-9]+/g) ?? [];
  return new Set(words.filter((w) => w.length > 3 || /^\d+$/.test(w)).map((w) => w.slice(0, 4)).filter((w) => !STOP.has(w)));
}

/** Overlap coefficient: a short retelling of a long post still matches. Rare words weigh more when `weight` is given. */
export function similarity(a: Set<string>, b: Set<string>, weight: (w: string) => number = () => 1): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  let sa = 0;
  let sb = 0;
  for (const w of a) {
    sa += weight(w);
    if (b.has(w)) common += weight(w);
  }
  for (const w of b) sb += weight(w);
  return common / Math.min(sa, sb);
}

/** Country flags of a title; 🇷🇺 says nothing in a Russian feed. */
const flags = (s: string): Set<string> => new Set((s.match(/\p{Regional_Indicator}{2}/gu) ?? []).filter((f) => f !== '🇷🇺'));

export interface Shape {
  title: Set<string>;
  all: Set<string>;
  flags: Set<string>;
}
export const shapeOf = (it: Pick<NewsItem, 'title' | 'text'>): Shape => ({ title: stems(it.title), all: stems(`${it.title} ${it.text}`), flags: flags(it.title) });

/** Rarity of each word stem in a batch of news: "безвиз" says more than "Турция". */
export function rarity(shapes: readonly Shape[]): (w: string) => number {
  const df = new Map<string, number>();
  for (const s of shapes) for (const w of s.all) df.set(w, (df.get(w) ?? 0) + 1);
  const n = Math.max(shapes.length, 2);
  return (w) => Math.log(1 + n / (df.get(w) ?? 1));
}

/**
 * Same story? Tuned on real retellings (Черногория, Индия, Венеция, Болгария, «Белавиа») and near misses
 * (Египет и Турция, пляжи Аджмана и Сочи): the texts share rare words, or the titles do, or both posts carry
 * the same country flag and share some words.
 */
export function sameStory(a: Shape, b: Shape, weight: (w: string) => number): boolean {
  const all = similarity(a.all, b.all, weight);
  let common = 0;
  for (const w of a.all) if (b.all.has(w)) common++;
  // A two-line excerpt shares a word or two with anything: at least three words in common.
  if (all >= 0.33 && common >= 3) return true;
  if (Math.min(a.title.size, b.title.size) >= 3 && similarity(a.title, b.title, weight) >= 0.52) return true;
  return [...a.flags].some((f) => b.flags.has(f)) && all >= 0.15;
}

/**
 * Merges retellings of one story into the earliest item (others go to `also`); comparison stays within 36 hours
 * and with every post already in the story. Two `independent` sources are never merged with each other:
 * each airline's or airport's own notice stays separate.
 */
export function dedupe(items: NewsItem[], independent: (sourceId: string) => boolean = () => false): NewsItem[] {
  const byTime = [...items].sort((a, b) => a.at.localeCompare(b.at));
  const shapes = byTime.map(shapeOf);
  const weight = rarity(shapes);
  const out: Array<{ item: NewsItem; shapes: Shape[]; sources: Set<string>; t: number }> = [];
  byTime.forEach((it, i) => {
    const shape = shapes[i] as Shape;
    const t = Date.parse(it.at);
    const twin = out.find(
      (o) =>
        !o.sources.has(it.sourceId) &&
        !(independent(it.sourceId) && [...o.sources].some(independent)) &&
        Math.abs(o.t - t) < 36 * 3600e3 &&
        o.shapes.some((s) => sameStory(s, shape, weight)),
    );
    if (twin) {
      if (independent(twin.item.sourceId) && !independent(it.sourceId)) {
        // A retelling with a real headline leads; the airline's own notice («Сообщение авиакомпании») goes to the links.
        const old = twin.item;
        twin.item = { ...it, also: [{ sourceId: old.sourceId, url: old.url }, ...old.also, ...it.also] };
      } else if (!twin.item.also.some((x) => x.url === it.url)) twin.item = { ...twin.item, also: [...twin.item.also, { sourceId: it.sourceId, url: it.url }, ...it.also] };
      twin.shapes.push(shape);
      twin.sources.add(it.sourceId);
    } else out.push({ item: { ...it }, shapes: [shape], sources: new Set([it.sourceId, ...it.also.map((x) => x.sourceId)]), t });
  });
  return out.map((o) => o.item).sort((a, b) => b.at.localeCompare(a.at));
}
