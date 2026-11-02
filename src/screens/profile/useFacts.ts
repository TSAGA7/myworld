import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, useToday, useWorld } from '../../app/world';
import { achievements, computeFacts } from '../../domain/achievements';
import { tripStatus } from '../../domain/dates';
import { worldProgress } from '../../domain/world';
import { COUNTRIES, countryName } from '../../geo/reference';

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
      trips: data.trips.filter((t) => tripStatus(t.startDate, t.endDate, today) !== 'upcoming'),
      stops: data.stops,
      visits: data.visits,
      percent: progress.percent,
      home,
      today,
    });
    const list = achievements(facts, data.world, data.cities, {
      tripsCreated: data.trips.length,
      ...counts,
      countryName,
      years: data.years,
      trips: data.trips.filter((t) => tripStatus(t.startDate, t.endDate, today) !== 'upcoming'),
      stops: data.stops,
      home,
    });
    return { progress, facts, achievements: list, home };
  }, [data, today, counts]);
}
