/** Text search over countries and the city catalog: case-, accent- and ё-insensitive, prefix matches first. */

export const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-‐–—'’.,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Catalog city as shipped in public/data/cities.json. */
export interface CatalogCity {
  id: string; // "ne:<Natural Earth id>"
  ru: string;
  en: string;
  countryId: string;
  lat: number;
  lon: number;
  pop: number;
  region: string;
  capital: boolean;
}

export interface Indexed<T> {
  item: T;
  keys: string[];
}

export const indexItems = <T>(items: readonly T[], names: (t: T) => Array<string | null | undefined>): Indexed<T>[] =>
  items.map((item) => ({ item, keys: names(item).filter((n): n is string => !!n).map(normalize) }));

/**
 * Score: 3 – a name equals the query, 2 – a name starts with it, 1 – a word inside a name starts with it.
 * Ties go to the larger `weight` (population for cities).
 */
export function search<T>(index: readonly Indexed<T>[], query: string, limit: number, weight: (t: T) => number = () => 0): T[] {
  const q = normalize(query);
  if (!q) return [];
  const hits: Array<{ item: T; score: number; w: number }> = [];
  for (const { item, keys } of index) {
    let score = 0;
    for (const k of keys) {
      const s = k === q ? 3 : k.startsWith(q) ? 2 : k.includes(` ${q}`) ? 1 : 0;
      if (s > score) score = s;
      if (score === 3) break;
    }
    if (score > 0) hits.push({ item, score, w: weight(item) });
  }
  hits.sort((a, b) => b.score - a.score || b.w - a.w);
  return hits.slice(0, limit).map((h) => h.item);
}
