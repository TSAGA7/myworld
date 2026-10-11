import { tripStatus } from './dates';
import type { City, Methodology, PlannedMark, Trip, TripStop, Visit } from './model';

/** Country reference entry (generated from Natural Earth, see scripts/build_geodata.py). */
export interface CountryRef {
  id: string;
  iso2: string | null;
  iso3: string;
  ru: string;
  en: string;
  continent: string;
  subregion: string;
  type: string;
  sovereign: string | null;
  un: boolean;
  m195: boolean;
  label: [number, number];
  bbox: [number, number, number, number];
  small: boolean;
  flag: boolean;
}

export type PlaceStatus = 'visited' | 'planned' | 'none';

export const METHODOLOGY_INFO: Record<Methodology, { title: string; hint: string }> = {
  m195: { title: '195 стран', hint: '193 члена ООН, Ватикан и Палестина — самый распространённый счёт.' },
  un193: { title: '193 члена ООН', hint: 'Только государства — члены ООН.' },
  all: {
    title: 'Все территории',
    hint: 'Страны вместе с зависимыми и спорными территориями: Гренландия, Тайвань, Косово, Пуэрто-Рико и другие.',
  },
};

/** Countries that count in the chosen methodology. */
export const inMethodology = (c: CountryRef, m: Methodology): boolean =>
  m === 'm195' ? c.m195 : m === 'un193' ? c.un : c.type !== 'Indeterminate';

export interface WorldState {
  /** Status of every city that is on the user's map. */
  cityStatus: Map<string, PlaceStatus>;
  countryStatus: Map<string, PlaceStatus>;
  visitedCityIds: Set<string>;
  visitedCountryIds: Set<string>;
  plannedCityIds: Set<string>;
  plannedCountryIds: Set<string>;
  /** Number of trips whose route goes through the city. */
  cityTripCount: Map<string, number>;
  /** Visited cities per country. */
  visitedCitiesByCountry: Map<string, number>;
  /** Earliest known visit date per country. */
  firstVisitByCountry: Map<string, string>;
}

/** Derives map and statistics state from the user's facts. Visits always win over plans. */
export function deriveWorld(visits: readonly Visit[], plans: readonly PlannedMark[], stops: readonly TripStop[]): WorldState {
  const visitedCityIds = new Set<string>();
  const visitedCountryIds = new Set<string>();
  const visitedCitiesByCountry = new Map<string, number>();
  const firstVisitByCountry = new Map<string, string>();
  for (const v of visits) {
    visitedCountryIds.add(v.countryId);
    if (v.cityId && !visitedCityIds.has(v.cityId)) {
      visitedCityIds.add(v.cityId);
      visitedCitiesByCountry.set(v.countryId, (visitedCitiesByCountry.get(v.countryId) ?? 0) + 1);
    }
    if (v.date) {
      const prev = firstVisitByCountry.get(v.countryId);
      if (!prev || v.date < prev) firstVisitByCountry.set(v.countryId, v.date);
    }
  }
  const plannedCityIds = new Set<string>();
  const plannedCountryIds = new Set<string>();
  for (const p of plans) {
    if (p.cityId && !visitedCityIds.has(p.cityId)) plannedCityIds.add(p.cityId);
    if (!visitedCountryIds.has(p.countryId)) plannedCountryIds.add(p.countryId);
  }
  const cityStatus = new Map<string, PlaceStatus>();
  for (const id of plannedCityIds) cityStatus.set(id, 'planned');
  for (const id of visitedCityIds) cityStatus.set(id, 'visited');
  const countryStatus = new Map<string, PlaceStatus>();
  for (const id of plannedCountryIds) countryStatus.set(id, 'planned');
  for (const id of visitedCountryIds) countryStatus.set(id, 'visited');

  const tripsByCity = new Map<string, Set<string>>();
  for (const s of stops) {
    const set = tripsByCity.get(s.cityId) ?? new Set<string>();
    set.add(s.tripId);
    tripsByCity.set(s.cityId, set);
  }
  const cityTripCount = new Map<string, number>();
  for (const [id, set] of tripsByCity) cityTripCount.set(id, set.size);

  return {
    cityStatus,
    countryStatus,
    visitedCityIds,
    visitedCountryIds,
    plannedCityIds,
    plannedCountryIds,
    cityTripCount,
    visitedCitiesByCountry,
    firstVisitByCountry,
  };
}

export interface WorldProgress {
  visited: number;
  total: number;
  remaining: number;
  /** Percent with one decimal. */
  percent: number;
}

/** Unique visited countries within the methodology / its size × 100. Cities and repeat visits never change it. */
export function worldProgress(countries: readonly CountryRef[], visitedCountryIds: ReadonlySet<string>, m: Methodology): WorldProgress {
  const pool = countries.filter((c) => inMethodology(c, m));
  const visited = pool.filter((c) => visitedCountryIds.has(c.id)).length;
  const total = pool.length;
  const percent = total === 0 ? 0 : Math.round((visited / total) * 1000) / 10;
  return { visited, total, remaining: total - visited, percent };
}

/** The most recent trip that has started, else the latest dated visit. */
export function lastJourney(
  trips: readonly Trip[],
  visits: readonly Visit[],
  cities: ReadonlyMap<string, City>,
  today: string,
  countryName: (id: string) => string,
): { title: string; date: string | null; tripId: string | null } | null {
  const past = trips
    .filter((t) => tripStatus(t.startDate, t.endDate, today) !== 'upcoming' && t.startDate)
    .sort((a, b) => ((b.startDate ?? '') < (a.startDate ?? '') ? -1 : 1));
  const t = past[0];
  if (t) return { title: t.title, date: t.startDate, tripId: t.id };
  const v = [...visits].filter((x) => x.date).sort((a, b) => ((b.date ?? '') < (a.date ?? '') ? -1 : 1))[0];
  if (v) return { title: (v.cityId && cities.get(v.cityId)?.name) || countryName(v.countryId), date: v.date, tripId: null };
  return null;
}
