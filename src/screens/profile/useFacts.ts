import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db, useToday, useWorld } from '../../app/world';
import { achievements, computeFacts, type Facts } from '../../domain/achievements';
import { COUNTRIES, COUNTRY_BY_ID, countryName } from '../../geo/reference';
import { countLabel, plural, tripStatus } from '../../domain/dates';
import type { FactRow } from '../../domain/hobbyFacts';
import type { Trip } from '../../domain/model';
import { inMethodology, worldProgress } from '../../domain/world';
import { bestYear, countriesPerYear, type YearCount } from '../../domain/years';

const km = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} км`;
const thousandKm = (n: number) => `${String(Math.round(n / 100) / 10).replace('.', ',')} тыс. км`;

/** «Факты» about travels; `short` is the shorter line for the share card. */
export function travelFactRows(facts: Facts, trips: readonly Trip[], perYear: readonly YearCount[], top: YearCount | null, today: string): FactRow[] {
  const rows: FactRow[] = [];
  if (facts.routeKm > 0)
    rows.push({ id: 't-route', icon: '🛫', text: `${km(facts.routeKm)} по маршрутам — это ${facts.aroundEarth} ${plural(Math.floor(facts.aroundEarth), 'оборот', 'оборота', 'оборотов')} вокруг Земли`, short: `${thousandKm(facts.routeKm)} по маршрутам` });
  if (facts.farthestFromHome)
    rows.push({ id: 't-far', icon: '📍', text: `Дальше всего от дома — ${facts.farthestFromHome.city.name}, ${km(facts.farthestFromHome.km)}`, short: `Дальше всего от дома — ${facts.farthestFromHome.city.name}, ${thousandKm(facts.farthestFromHome.km)}` });
  if (facts.north) rows.push({ id: 't-north', icon: '🧊', text: `Самая северная точка — ${facts.north.name} (${(facts.north.lat as number).toFixed(1)}° с. ш.)` });
  if (facts.south && facts.south.id !== facts.north?.id) {
    const lat = facts.south.lat as number;
    rows.push({ id: 't-south', icon: '🌴', text: `Самая южная — ${facts.south.name} (${Math.abs(lat).toFixed(1)}° ${lat < 0 ? 'ю. ш.' : 'с. ш.'})` });
  }
  if (facts.topCountry && facts.topCountry.cities > 1)
    rows.push({ id: 't-top', icon: '❤️', text: `Больше всего городов — ${countryName(facts.topCountry.id)}: ${countLabel(facts.topCountry.cities, 'город', 'города', 'городов')}` });
  const liked = trips.filter((t) => t.favorite);
  if (liked.length) rows.push({ id: 't-liked', icon: '♥️', text: `Любимые поездки: ${liked.map((t) => t.title).join(', ')}` });
  const thisYear = perYear.find((y) => y.year === Number(today.slice(0, 4)));
  if (thisYear) rows.push({ id: 't-year', icon: '📆', text: `В этом году — ${countLabel(thisYear.countries, 'страна', 'страны', 'стран')}`, short: `В ${thisYear.year} — ${countLabel(thisYear.countries, 'страна', 'страны', 'стран')}` });
  if (top && perYear.length > 1) rows.push({ id: 't-best', icon: '🏆', text: `В ${top.year} больше всего стран — ${top.countries}` });
  return rows;
}

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
    // Countries per year (by the chosen counting method) and the record year.
    const counted = new Set([...data.world.visitedCountryIds].filter((id) => {
      const c = COUNTRY_BY_ID.get(id);
      return !!c && inMethodology(c, data.settings.methodology);
    }));
    const perYear = countriesPerYear(data.years, counted);
    const top = bestYear(perYear);
    return { progress, facts, achievements: list, home, perYear, top, travelRows: travelFactRows(facts, data.trips, perYear, top, today) };
  }, [data, today, counts]);
}
