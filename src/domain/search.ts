/** Text search over countries and the city catalog: case-, accent- and ё-insensitive, prefix matches first. */

/**
 * Search form of a name: lower case, no accents or punctuation, and the spelling slips of Russian
 * transliteration ironed out — ё/е, э/е, soft and hard signs («Эльче» ≈ «Елче»). Used only to compare, never shown.
 */
export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[ёэ]/g, 'е')
    .replace(/[ьъ]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[-‐–—'’`.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Doubled letters squeezed: the last chance for «Торевьеха» to meet «Торревьеха» (ranked below exact spelling, so «Канн» stays Cannes, not Caen). */
export const squash = (normalized: string): string => normalized.replace(/(\p{L})\1+/gu, '$1');

/** Keys stored for a name: its search form, plus the squeezed form when that differs. */
export const searchKeys = (names: Array<string | null | undefined>): string[] => {
  const keys: string[] = [];
  for (const n of names) {
    if (!n) continue;
    const k = normalize(n);
    keys.push(k);
    const sq = squash(k);
    if (sq !== k) keys.push(sq);
  }
  return keys;
};

const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', ю: 'yu', я: 'ya',
};

/**
 * A Cyrillic query spelled in Latin letters, to meet places known only by their local name
 * («Альтеа» → «altea», «Эльче» → «elche»). Null for a query that is not Cyrillic.
 */
export const toLatin = (normalized: string): string | null =>
  /[а-я]/.test(normalized) ? squash(normalize([...normalized].map((ch) => LATIN[ch] ?? ch).join(''))) : null;

/** Catalog city as shipped in public/data/cities.json. */
export interface CatalogCity {
  id: string; // "ne:<Natural Earth id>" for the 7k major cities, "gn:<GeoNames id>" for the rest
  ru: string;
  en: string;
  countryId: string;
  lat: number;
  lon: number;
  pop: number;
  /** Region id ("RU-15") and its Russian name. */
  regionId: string;
  region: string;
  capital: boolean;
  /** Seat of a region (oblast, state, province). */
  regionCapital: boolean;
}

export interface Indexed<T> {
  item: T;
  keys: string[];
}

export const indexItems = <T>(items: readonly T[], names: (t: T) => Array<string | null | undefined>): Indexed<T>[] =>
  items.map((item) => ({ item, keys: searchKeys(names(item)) }));

/**
 * Score: 3 – a name equals the query, 2 – a name starts with it, 1 – a word inside a name starts with it.
 * Ties go to the larger `weight` (population for cities).
 */
export function search<T>(index: readonly Indexed<T>[], query: string, limit: number, weight: (t: T) => number = () => 0): T[] {
  const q = normalize(query);
  if (!q) return [];
  // Second chances, ranked just below the real spelling: doubled letters squeezed, then a Cyrillic query in Latin letters.
  const sq = squash(q);
  const lat = q.length > 2 ? toLatin(q) : null;
  const rate = (k: string, x: string) => (k === x ? 3 : k.startsWith(x) ? 2 : k.includes(` ${x}`) ? 1 : 0);
  const hits: Array<{ item: T; score: number; w: number }> = [];
  for (const { item, keys } of index) {
    let score = 0;
    for (const k of keys) {
      let s = rate(k, q);
      if (!s && sq !== q) s = rate(k, sq) - 0.25;
      if (s <= 0 && lat) s = rate(k, lat) - 0.5;
      if (s > score) score = s;
      if (score === 3) break;
    }
    if (score > 0) hits.push({ item, score, w: weight(item) });
  }
  hits.sort((a, b) => b.score - a.score || b.w - a.w);
  return hits.slice(0, limit).map((h) => h.item);
}
