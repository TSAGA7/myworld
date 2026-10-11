import { type CatalogCity, type Indexed, indexItems, search } from '../domain/search';
import type { CityInput } from '../data/store';
import { loadStatic } from './reference';

interface CitiesFile {
  fields: string[];
  rows: Array<[string, string, string, string, number, number, number, string, number]>;
}

export interface Catalog {
  byId: Map<string, CatalogCity>;
  search(q: string, limit?: number, countryId?: string): CatalogCity[];
}

let catalog: Promise<Catalog> | null = null;

/** City catalog: 7 340 populated places from Natural Earth with Russian names. Loaded on first use. */
export function loadCatalog(): Promise<Catalog> {
  if (!catalog) {
    catalog = loadStatic<CitiesFile>('data/cities.json').then((file) => {
      const list: CatalogCity[] = file.rows.map(([id, ru, en, countryId, lat, lon, pop, region, capital]) => ({
        id: `ne:${id}`, ru, en: en || ru, countryId, lat, lon, pop, region, capital: capital === 1,
      }));
      const index: Indexed<CatalogCity>[] = indexItems(list, (c) => [c.ru, c.en]);
      const byCountry = new Map<string, Indexed<CatalogCity>[]>();
      for (const i of index) {
        const arr = byCountry.get(i.item.countryId) ?? [];
        arr.push(i);
        byCountry.set(i.item.countryId, arr);
      }
      return {
        byId: new Map(list.map((c) => [c.id, c])),
        search: (q, limit = 8, countryId) => search(countryId ? (byCountry.get(countryId) ?? []) : index, q, limit, (c) => c.pop + (c.capital ? 5e7 : 0)),
      };
    });
    catalog.catch(() => (catalog = null));
  }
  return catalog;
}

export const catalogToCity = (c: CatalogCity): CityInput => ({
  id: c.id, name: c.ru, nameEn: c.en === c.ru ? '' : c.en, countryId: c.countryId, lat: c.lat, lon: c.lon, region: c.region, source: 'catalog',
});
