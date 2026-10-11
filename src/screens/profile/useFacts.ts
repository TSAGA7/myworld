import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, useToday, useWorld } from '../../app/world';
import { achievements, computeFacts } from '../../domain/achievements';
import { worldProgress } from '../../domain/world';
import { COUNTRIES } from '../../geo/reference';

/** Statistics, facts and achievements of the user, recomputed live. */
export function useFacts() {
  const data = useWorld();
  const today = useToday();
  const counts = useLiveQuery(async () => ({ diary: await db.diary.count(), expenses: await db.expenses.count() }), [], { diary: 0, expenses: 0 });
  return useMemo(() => {
    const progress = worldProgress(COUNTRIES, data.world.visitedCountryIds, data.settings.methodology);
    const home = data.settings.homeCityId ? (data.cities.get(data.settings.homeCityId) ?? null) : null;
    const facts = computeFacts({
      world: data.world,
      countries: COUNTRIES,
      cities: data.cities,
      trips: data.trips,
      stops: data.stops,
      visits: data.visits,
      percent: progress.percent,
      home,
      today,
    });
    const list = achievements(facts, data.world, data.cities, { tripsCreated: data.trips.length, ...counts });
    return { progress, facts, achievements: list, home };
  }, [data, today, counts]);
}
