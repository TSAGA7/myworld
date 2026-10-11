import type { CityInput } from '../data/store';
import { type CatalogCity, type Indexed, normalize, search } from '../domain/search';
import { loadStatic } from './reference';

export interface Catalog {
  byId: Map<string, CatalogCity>;
  list: CatalogCity[];
  regionNames: Record<string, string>;
  search(q: string, limit?: number, countryId?: string): CatalogCity[];
}

let catalog: Promise<Catalog> | null = null;

const BASE = import.meta.env.BASE_URL;

/**
 * The world's city catalog: ~194 000 places with 500+ people (GeoNames), Russian names where known
 * (Natural Earth and GeoNames alternate names), regions and population. Loaded once, on first use.
 */
export function loadCatalog(): Promise<Catalog> {
  if (!catalog) {
    catalog = Promise.all([
      fetch(`${BASE}data/cities.tsv`).then((r) => {
        if (!r.ok) throw new Error(`Справочник городов не загрузился (${r.status})`);
        return r.text();
      }),
      loadStatic<Record<string, string>>('data/region-names.json').catch(() => ({}) as Record<string, string>),
    ]).then(([text, regionNames]) => {
      const list: CatalogCity[] = [];
      const index: Indexed<CatalogCity>[] = [];
      const big: Indexed<CatalogCity>[] = [];
      const byCountry = new Map<string, Indexed<CatalogCity>[]>();
      for (const line of text.split('\n')) {
        const [id, ru, en, countryId, lat, lon, pop, regionId, flags] = line.split('\t');
        if (!id || !ru || !countryId) continue;
        const c: CatalogCity = {
          id,
          ru,
          en: en || ru,
          countryId,
          lat: Number(lat),
          lon: Number(lon),
          pop: Number(pop) || 0,
          regionId: regionId ?? '',
          region: regionNames[regionId ?? ''] ?? '',
          capital: flags === '1',
          regionCapital: flags === '2',
        };
        list.push(c);
        const keys = [normalize(c.ru)];
        if (en) keys.push(normalize(en));
        const item = { item: c, keys };
        index.push(item);
        if (c.pop >= 15000 || c.capital || c.regionCapital) big.push(item);
        let arr = byCountry.get(countryId);
        if (!arr) byCountry.set(countryId, (arr = []));
        arr.push(item);
      }
      const weight = (c: CatalogCity) => c.pop + (c.capital ? 5e7 : c.regionCapital ? 5e5 : 0);
      return {
        list,
        regionNames,
        byId: new Map(list.map((c) => [c.id, c])),
        // One letter searches only the big cities, so the list stays meaningful and fast.
        search: (q, limit = 8, countryId) => {
          const pool = countryId ? (byCountry.get(countryId) ?? []) : normalize(q).length < 2 ? big : index;
          return search(pool, q, limit, weight);
        },
      };
    });
    catalog.catch(() => (catalog = null));
  }
  return catalog;
}

export const catalogToCity = (c: CatalogCity): CityInput => ({
  id: c.id, name: c.ru, nameEn: c.en === c.ru ? '' : c.en, countryId: c.countryId, lat: c.lat, lon: c.lon, region: c.region, source: 'catalog',
});
