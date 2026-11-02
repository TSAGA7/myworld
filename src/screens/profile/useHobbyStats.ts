import { useMemo } from 'react';
import { useWorld } from '../../app/world';
import type { Resort, Spot } from '../../domain/hobby';
import { type FactRow, riderFacts, surfFacts } from '../../domain/hobbyFacts';
import { type RiderAchievement, riderAchievements, type VisitedResort } from '../../domain/riderAchievements';
import { surfAchievements } from '../../domain/surfAchievements';
import { useCatalog } from '../../geo/hobbyCatalog';
import { countryName } from '../../geo/reference';

export interface HobbyStats {
  resorts: Resort[];
  spots: Spot[];
  favourites: number;
  /** Active places in the catalogs (for «N из M»). */
  resortTotal: number;
  spotTotal: number;
  riderRows: FactRow[];
  surfRows: FactRow[];
  riderAch: RiderAchievement[];
  surfAch: RiderAchievement[];
}

/** Visited resorts / spots (from «Был здесь», found in the catalogs), their facts and achievements. */
export function useHobbyStats(): HobbyStats {
  const { settings, hobby, cities } = useWorld();
  const resortCat = useCatalog('resorts', !!settings.riderType);
  const spotCat = useCatalog('spots', settings.surf);
  return useMemo(() => {
    const home = settings.homeCityId ? (cities.get(settings.homeCityId) ?? null) : null;
    const marks: VisitedResort[] = hobby.filter((m) => m.what === 'visit' && m.kind === 'resort').map((m) => ({ id: m.placeId, resort: resortCat.index.get(m.placeId) ?? null }));
    const uniq = <T extends { id: string }>(xs: Array<T | null | undefined>): T[] => {
      const seen = new Map<string, T>();
      for (const x of xs) if (x && !seen.has(x.id)) seen.set(x.id, x);
      return [...seen.values()];
    };
    const resorts = uniq(marks.map((m) => m.resort));
    const spots = uniq(hobby.filter((m) => m.what === 'visit' && m.kind === 'spot').map((m) => spotCat.index.get(m.placeId)));
    const favourites = uniq(hobby.filter((m) => m.what === 'fav' && m.kind === 'spot').map((m) => spotCat.index.get(m.placeId) ?? { id: m.placeId })).length;
    return {
      resorts,
      spots,
      favourites,
      resortTotal: resortCat.items.filter((r) => r.active).length,
      spotTotal: spotCat.items.filter((r) => r.active).length,
      riderRows: riderFacts(resorts, countryName, home),
      surfRows: surfFacts(spots, favourites, countryName, home),
      riderAch: riderAchievements(marks, countryName),
      surfAch: surfAchievements(spots, favourites, countryName),
    };
  }, [settings.homeCityId, hobby, cities, resortCat, spotCat]);
}
