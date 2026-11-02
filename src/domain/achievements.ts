import { tripStatus } from './dates';
import type { City, Trip, TripStop } from './model';
import type { CountryRef, WorldState } from './world';

export const EARTH_KM = 40075;

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const INHABITED_CONTINENTS = ['Европа', 'Азия', 'Африка', 'Северная Америка', 'Южная Америка', 'Океания'] as const;
const ISLAND_NATIONS = new Set([
  'JP', 'GB', 'IE', 'IS', 'CY', 'MT', 'LK', 'MV', 'MG', 'MU', 'SC', 'CV', 'ST', 'KM', 'ID', 'PH', 'TW', 'NZ', 'FJ', 'PG', 'SB', 'VU', 'WS', 'TO',
  'KI', 'TV', 'NR', 'PW', 'FM', 'MH', 'CU', 'JM', 'BS', 'BB', 'TT', 'DM', 'LC', 'VC', 'GD', 'AG', 'KN', 'BH', 'SG', 'BN', 'TL', 'DO', 'HT',
]);
const MICROSTATES = new Set(['VA', 'MC', 'SM', 'LI', 'AD', 'MT']);

export interface Facts {
  countries: number;
  cities: number;
  percent: number;
  continents: string[];
  trips: number;
  routeKm: number;
  aroundEarth: number;
  north: City | null;
  south: City | null;
  farthestFromHome: { city: City; km: number } | null;
  topCountry: { id: string; cities: number } | null;
  countriesThisYear: number;
}

interface Input {
  world: WorldState;
  countries: readonly CountryRef[];
  cities: ReadonlyMap<string, City>;
  trips: readonly Trip[];
  stops: readonly TripStop[];
  visits: ReadonlyArray<{ countryId: string; date: string | null; years?: readonly number[] }>;
  percent: number;
  home: City | null;
  today: string;
}

const located = (c: City | undefined): c is City & { lat: number; lon: number } => !!c && c.lat !== null && c.lon !== null;

export function computeFacts(i: Input): Facts {
  const byId = new Map(i.countries.map((c) => [c.id, c]));
  const continents = [...new Set([...i.world.visitedCountryIds].map((id) => byId.get(id)?.continent).filter((c): c is string => !!c))];
  const visitedCities = [...i.world.visitedCityIds].map((id) => i.cities.get(id)).filter(located);
  let north: City | null = null;
  let south: City | null = null;
  for (const c of visitedCities) {
    if (!north || (c.lat as number) > (north.lat as number)) north = c;
    if (!south || (c.lat as number) < (south.lat as number)) south = c;
  }
  // Distance along the routes of trips that have started; with a home city, there and back home as well.
  let routeKm = 0;
  let trips = 0;
  const home = located(i.home ?? undefined) ? (i.home as City & { lat: number; lon: number }) : null;
  for (const t of i.trips) {
    if (tripStatus(t.startDate, t.endDate, i.today) === 'upcoming') continue;
    trips++;
    const pts = i.stops
      .filter((s) => s.tripId === t.id)
      .sort((a, b) => a.order - b.order)
      .map((s) => i.cities.get(s.cityId))
      .filter(located);
    const path = home && pts.length ? [home, ...pts, home] : pts;
    for (let k = 1; k < path.length; k++) routeKm += distanceKm(path[k - 1] as { lat: number; lon: number }, path[k] as { lat: number; lon: number });
  }
  let farthestFromHome: Facts['farthestFromHome'] = null;
  if (home) {
    for (const c of visitedCities) {
      const km = distanceKm(home, c as { lat: number; lon: number });
      if (!farthestFromHome || km > farthestFromHome.km) farthestFromHome = { city: c, km };
    }
  }
  let topCountry: Facts['topCountry'] = null;
  for (const [id, n] of i.world.visitedCitiesByCountry) if (!topCountry || n > topCountry.cities) topCountry = { id, cities: n };
  const year = i.today.slice(0, 4);
  const thisYear = new Set(i.visits.filter((v) => v.date?.startsWith(year) || v.years?.includes(Number(year))).map((v) => v.countryId));
  return {
    countries: i.world.visitedCountryIds.size,
    cities: i.world.visitedCityIds.size,
    percent: i.percent,
    continents,
    trips,
    routeKm: Math.round(routeKm),
    aroundEarth: Math.round((routeKm / EARTH_KM) * 10) / 10,
    north,
    south,
    farthestFromHome: farthestFromHome ? { ...farthestFromHome, km: Math.round(farthestFromHome.km) } : null,
    topCountry,
    countriesThisYear: thisYear.size,
  };
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  hint: string;
  value: number;
  target: number;
  done: boolean;
  /**
   * Short «за что» list for the window (the city beyond the polar circle, the continents…). Undefined — the achievement
   * is a plain counter (100 cities) and its tile does not open: the list would be too long to be useful.
   */
  details?: string[];
}

/** More data for the newer achievements; everything is optional so old callers keep working. */
export interface AchievementExtra {
  tripsCreated: number;
  diary: number;
  expenses: number;
  /** Country names (the windows show names, not codes). */
  countryName?: (id: string) => string;
  /** Years per visited country (domain/years.ts). */
  years?: ReadonlyMap<string, { all: number[] }>;
  trips?: readonly Trip[];
  stops?: readonly TripStop[];
  home?: City | null;
}

const MAX_DETAILS = 6;
/** At most six lines, then «и ещё N». */
export function shortList(items: readonly string[]): string[] {
  if (items.length <= MAX_DETAILS) return [...items];
  return [...items.slice(0, MAX_DETAILS - 1), `и ещё ${items.length - (MAX_DETAILS - 1)}`];
}

const TROPIC = 23.44;
const POLAR = 66.56;

export function achievements(f: Facts, world: WorldState, cities: ReadonlyMap<string, City>, extra: AchievementExtra): Achievement[] {
  const name = extra.countryName ?? ((id: string) => id);
  const visitedCities = [...world.visitedCityIds].map((id) => cities.get(id)).filter(located);
  const lats = visitedCities.map((c) => c.lat as number);
  const lons = visitedCities.map((c) => c.lon as number);
  const islandIds = [...world.visitedCountryIds].filter((id) => ISLAND_NATIONS.has(id));
  const microIds = [...world.visitedCountryIds].filter((id) => MICROSTATES.has(id));
  const islands = islandIds.length;
  const micro = microIds.length;
  const inhabitedList = f.continents.filter((c) => (INHABITED_CONTINENTS as readonly string[]).includes(c));
  const inhabited = inhabitedList.length;
  const cityLabel = (c: City) => `${c.name}, ${name(c.countryId)}`;
  const firstCity = (test: (c: City & { lat: number; lon: number }) => boolean) => visitedCities.filter(test).map(cityLabel);
  type Located = City & { lat: number; lon: number };
  const edgeCity = (test: (c: Located) => boolean, order: (a: Located, b: Located) => number): Located[] => visitedCities.filter(test).sort(order).slice(0, 1);
  const a = (id: string, icon: string, title: string, hint: string, value: number, target: number, details?: string[]): Achievement => ({
    id, icon, title, hint, value: Math.min(value, target), target, done: value >= target, ...(details ? { details: shortList(details) } : {}),
  });

  // ---- data for the newer achievements
  const firstCountry = [...world.firstVisitByCountry.entries()].sort((x, y) => x[1].localeCompare(y[1]))[0]?.[0];
  const perYear = new Map<number, string[]>();
  for (const [id, y] of extra.years ?? []) for (const year of y.all) perYear.set(year, [...(perYear.get(year) ?? []), id]);
  const busiest = [...perYear.entries()].sort((x, y) => y[1].length - x[1].length || y[0] - x[0])[0];
  const yearsList = [...perYear.keys()].sort((x, y) => x - y);
  const returns = [...(extra.years ?? [])].filter(([, y]) => y.all.length >= 3).sort((x, y) => y[1].all.length - x[1].all.length);
  const mostYears = Math.max(0, ...[...(extra.years ?? [])].map(([, y]) => y.all.length));
  const home = extra.home && located(extra.home) ? extra.home : null;
  const far = home ? visitedCities.filter((c) => distanceKm(home, c) >= 10000) : [];
  const farthestKm = f.farthestFromHome?.km ?? 0;
  const tripCountries = (extra.trips ?? []).map((t) => {
    const ids = new Set((extra.stops ?? []).filter((s) => s.tripId === t.id).map((s) => cities.get(s.cityId)?.countryId).filter((x): x is string => !!x));
    return { title: t.title, ids: [...ids] };
  }).sort((x, y) => y.ids.length - x.ids.length);
  const bestTrip = tripCountries[0];
  const americas = (['Северная Америка', 'Южная Америка'] as const).filter((c) => f.continents.includes(c));

  return [
    a('first', '🛂', 'Первый штамп', 'Отметьте первую страну', f.countries, 1, firstCountry ? [`Первая по дате — ${name(firstCountry)}`] : f.countries === 1 ? [...world.visitedCountryIds].map(name) : undefined),
    a('c5', '🧭', 'Путешественник', '5 стран', f.countries, 5),
    a('c10', '🗺️', 'Исследователь', '10 стран', f.countries, 10),
    a('c25', '✈️', 'Глобтроттер', '25 стран', f.countries, 25),
    a('c50', '🌍', 'Гражданин мира', '50 стран', f.countries, 50),
    a('c100', '👑', 'Легенда', '100 стран', f.countries, 100),
    a('city10', '🏙️', 'Горожанин', '10 городов', f.cities, 10),
    a('city50', '🌆', 'Мегаполис', '50 городов', f.cities, 50),
    a('city100', '🌃', 'Сто городов', '100 городов', f.cities, 100),
    a('cont3', '🧳', 'Три континента', 'Побывать на трёх континентах', inhabited, 3, inhabitedList),
    a('cont6', '🌐', 'Шесть континентов', 'Все обитаемые континенты', inhabited, 6, inhabitedList),
    a('equator', '🌗', 'Через экватор', 'Города в северном и южном полушариях', Number(lats.some((x) => x > 0)) + Number(lats.some((x) => x < 0)), 2, [
      ...(f.north && (f.north.lat as number) > 0 ? [`Север: ${cityLabel(f.north)}`] : []),
      ...(f.south && (f.south.lat as number) < 0 ? [`Юг: ${cityLabel(f.south)}`] : []),
    ]),
    a('meridian', '🕐', 'Запад и Восток', 'Города западнее и восточнее Гринвича (нулевого меридиана)', Number(lons.some((x) => x > 0)) + Number(lons.some((x) => x < 0)), 2, [
      // The most western and the most eastern city, not just any one (it used to pick a random suburb).
      ...edgeCity((c) => c.lon < 0, (a, b) => a.lon - b.lon).map((c) => `Самый западный: ${cityLabel(c)} (${Math.abs(c.lon).toFixed(0)}° з. д.)`),
      ...edgeCity((c) => c.lon > 0, (a, b) => b.lon - a.lon).map((c) => `Самый восточный: ${cityLabel(c)} (${c.lon.toFixed(0)}° в. д.)`),
    ]),
    a('polar', '❄️', 'Полярник', 'Город за полярным кругом', Number(lats.some((x) => Math.abs(x) >= POLAR)), 1, firstCity((c) => Math.abs(c.lat) >= POLAR)),
    a('islands', '🏝️', 'Островитянин', '3 островных государства', islands, 3, islandIds.map(name)),
    a('micro', '🏰', 'Карликовые государства', '3 из: Ватикан, Монако, Сан-Марино, Лихтенштейн, Андорра, Мальта', micro, 3, microIds.map(name)),
    a('earth', '🛰️', 'Вокруг света', `${EARTH_KM.toLocaleString('ru-RU')} км по маршрутам`, f.routeKm, EARTH_KM),
    a('planner', '📋', 'Планировщик', '3 поездки в приложении', extra.tripsCreated, 3),
    a('diary', '📔', 'Летописец', '10 записей в дневнике', extra.diary, 10),
    a('money', '🧾', 'Бухгалтер', '20 расходов в поездках', extra.expenses, 20),
    // ---- added 2026-11: years, latitudes, distance from home, trips
    a('year5', '📅', 'Насыщенный год', '5 стран за один год', busiest?.[1].length ?? 0, 5, busiest ? [`${busiest[0]}: ${busiest[1].map(name).join(', ')}`] : []),
    a('year10', '🚀', 'Год в пути', '10 стран за один год', busiest?.[1].length ?? 0, 10, busiest ? [`${busiest[0]} — ${busiest[1].length} стран`] : []),
    a('seasons', '🗓️', 'Стаж', 'Путешествия в пяти разных годах', yearsList.length, 5, yearsList.length ? [yearsList.join(', ')] : []),
    a('return', '🔁', 'Сюда я вернусь', 'Одна страна в трёх разных годах', mostYears, 3, returns.map(([id, y]) => `${name(id)}: ${y.all.join(', ')}`)),
    a('tropics', '🌴', 'Под солнцем тропиков', 'Город между тропиками', Number(lats.some((x) => Math.abs(x) < TROPIC)), 1, firstCity((c) => Math.abs(c.lat) < TROPIC)),
    a('south35', '🐧', 'Южный крест', 'Город южнее 35° ю. ш.', Number(lats.some((x) => x <= -35)), 1, firstCity((c) => c.lat <= -35)),
    a('americas', '🌎', 'Обе Америки', 'Северная и Южная Америка', americas.length, 2, [...americas]),
    a('far10k', '📏', 'На край света', home ? 'Город дальше 10 000 км от дома' : 'Город дальше 10 000 км от дома (укажите домашний город)', Math.min(farthestKm, 10000), 10000, home ? far.map((c) => `${cityLabel(c)} — ${Math.round(distanceKm(home, c)).toLocaleString('ru-RU')} км`) : []),
    a('deep', '🏘️', 'Знаток страны', '10 городов в одной стране', f.topCountry?.cities ?? 0, 10, f.topCountry ? [`${name(f.topCountry.id)} — ${f.topCountry.cities}`] : []),
    a('multi', '🚂', 'Мультивиза', 'Одна поездка через три страны', bestTrip?.ids.length ?? 0, 3, bestTrip && bestTrip.ids.length > 1 ? [`${bestTrip.title}: ${bestTrip.ids.map(name).join(', ')}`] : []),
  ];
}
