import { geoContains } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { useEffect, useMemo, useState } from 'react';
import { useWorld } from '../../app/world';
import type { CatalogCity } from '../../domain/search';
import { type Catalog, loadCatalog } from '../../geo/catalog';
import { loadStatic } from '../../geo/reference';

export type Region = Feature<Polygon | MultiPolygon, { id: string; ru: string; en: string }>;
export type VisitedCity = { id: string; name: string; regionId: string; lat: number | null; lon: number | null };
/** Cities from this population up count as "big". */
export const BIG = 100_000;

/**
 * Everything «Моя страна» counts for one country: its regions, catalog cities, the user's visited cities there and
 * which regions they open. Shared by the «Моя страна» screen and the social card, so both always show the same numbers.
 */
export function useHomeStats(countryId: string | null) {
  const { world, cities } = useWorld();
  const [regions, setRegions] = useState<Region[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setRegions(null);
    setFailed(false);
    if (!countryId) return;
    loadStatic<FeatureCollection<Polygon | MultiPolygon, Region['properties']>>(`data/regions/${countryId}.json`)
      .then((fc) => alive && setRegions(fc.features as Region[]))
      .catch(() => alive && setRegions([]));
    loadCatalog()
      .then((c) => alive && setCatalog(c))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [countryId]);

  // Catalog cities of this country, by region.
  const local = useMemo(() => {
    if (!catalog || !countryId) return null;
    const list = catalog.list.filter((c) => c.countryId === countryId);
    const byRegion = new Map<string, CatalogCity[]>();
    for (const c of list) {
      const arr = byRegion.get(c.regionId) ?? [];
      arr.push(c);
      byRegion.set(c.regionId, arr);
    }
    for (const arr of byRegion.values()) arr.sort((a, b) => b.pop - a.pop);
    return { list, byRegion, big: list.filter((c) => c.pop >= BIG), seats: list.filter((c) => c.regionCapital) };
  }, [catalog, countryId]);

  // The user's visited cities in this country, with their region.
  const visited = useMemo(() => {
    const out: VisitedCity[] = [];
    if (!countryId) return out;
    for (const id of world.visitedCityIds) {
      const c = cities.get(id);
      if (!c || c.countryId !== countryId) continue;
      let regionId = catalog?.byId.get(id)?.regionId ?? '';
      if (!regionId && regions && c.lat !== null && c.lon !== null) {
        const pt: [number, number] = [c.lon, c.lat];
        regionId = regions.find((r) => geoContains(r, pt))?.properties.id ?? '';
      }
      out.push({ id, name: c.name, regionId, lat: c.lat, lon: c.lon });
    }
    return out;
  }, [world.visitedCityIds, cities, countryId, catalog, regions]);

  const openedRegions = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of visited) if (v.regionId) m.set(v.regionId, (m.get(v.regionId) ?? 0) + 1);
    return m;
  }, [visited]);

  const total = regions?.length ?? 0;
  const opened = regions ? regions.filter((r) => openedRegions.has(r.properties.id)).length : 0;
  const percent = total ? Math.round((opened / total) * 1000) / 10 : 0;
  const bigVisited = local ? local.big.filter((c) => world.visitedCityIds.has(c.id)).length : null;
  const seatsVisited = local ? local.seats.filter((c) => world.visitedCityIds.has(c.id)).length : null;

  return { regions, catalog, local, failed, visited, openedRegions, total, opened, percent, bigVisited, seatsVisited };
}
