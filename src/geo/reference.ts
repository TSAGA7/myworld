import countriesJson from '../data/countries.json';
import { indexItems, search } from '../domain/search';
import type { CountryRef } from '../domain/world';

/** Country reference (Natural Earth), bundled with the app. */
export const COUNTRIES = countriesJson as CountryRef[];
export const COUNTRY_BY_ID: ReadonlyMap<string, CountryRef> = new Map(COUNTRIES.map((c) => [c.id, c]));

export const countryName = (id: string): string => COUNTRY_BY_ID.get(id)?.ru ?? id;

/** Flag image url (flag-icons, MIT) or null for territories without a flag file. */
export const flagUrl = (id: string): string | null => (COUNTRY_BY_ID.get(id)?.flag ? `${import.meta.env.BASE_URL}flags/${id.toLowerCase()}.svg` : null);

const index = indexItems(COUNTRIES, (c) => [c.ru, c.en, c.iso3, c.iso2]);
export const searchCountries = (q: string, limit = 6): CountryRef[] => search(index, q, limit, (c) => (c.m195 ? 1 : 0));

/** Shared lazy loader for static JSON files in public/: fetched once per session, then served from memory. */
const cache = new Map<string, Promise<unknown>>();
export function loadStatic<T>(path: string): Promise<T> {
  let p = cache.get(path);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}${path}`).then((r) => {
      if (!r.ok) throw new Error(`Не удалось загрузить ${path} (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p as Promise<T>;
}
