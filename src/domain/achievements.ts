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
  visits: ReadonlyArray<{ countryId: string; date: string | null }>;
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
  const thisYear = new Set(i.visits.filter((v) => v.date?.startsWith(year)).map((v) => v.countryId));
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
}

export function achievements(f: Facts, world: WorldState, cities: ReadonlyMap<string, City>, extra: { tripsCreated: number; diary: number; expenses: number }): Achievement[] {
  const visitedCities = [...world.visitedCityIds].map((id) => cities.get(id)).filter(located);
  const lats = visitedCities.map((c) => c.lat as number);
  const lons = visitedCities.map((c) => c.lon as number);
  const islands = [...world.visitedCountryIds].filter((id) => ISLAND_NATIONS.has(id)).length;
  const micro = [...world.visitedCountryIds].filter((id) => MICROSTATES.has(id)).length;
  const inhabited = f.continents.filter((c) => (INHABITED_CONTINENTS as readonly string[]).includes(c)).length;
  const a = (id: string, icon: string, title: string, hint: string, value: number, target: number): Achievement => ({
    id, icon, title, hint, value: Math.min(value, target), target, done: value >= target,
  });
  return [
    a('first', '🛂', 'Первый штамп', 'Отметьте первую страну', f.countries, 1),
    a('c5', '🧭', 'Путешественник', '5 стран', f.countries, 5),
    a('c10', '🗺️', 'Исследователь', '10 стран', f.countries, 10),
    a('c25', '✈️', 'Глобтроттер', '25 стран', f.countries, 25),
    a('c50', '🌍', 'Гражданин мира', '50 стран', f.countries, 50),
    a('c100', '👑', 'Легенда', '100 стран', f.countries, 100),
    a('city10', '🏙️', 'Горожанин', '10 городов', f.cities, 10),
    a('city50', '🌆', 'Мегаполис', '50 городов', f.cities, 50),
    a('city100', '🌃', 'Сто городов', '100 городов', f.cities, 100),
    a('cont3', '🧳', 'Три континента', 'Побывать на трёх континентах', inhabited, 3),
    a('cont6', '🌐', 'Шесть континентов', 'Все обитаемые континенты', inhabited, 6),
    a('equator', '🌗', 'Через экватор', 'Города в северном и южном полушариях', Number(lats.some((x) => x > 0)) + Number(lats.some((x) => x < 0)), 2),
    a('meridian', '🕐', 'Запад и Восток', 'Города в западном и восточном полушариях', Number(lons.some((x) => x > 0)) + Number(lons.some((x) => x < 0)), 2),
    a('polar', '❄️', 'Полярник', 'Город за полярным кругом', Number(lats.some((x) => Math.abs(x) >= 66.56)), 1),
    a('islands', '🏝️', 'Островитянин', '3 островных государства', islands, 3),
    a('micro', '🏰', 'Карликовые государства', '3 из: Ватикан, Монако, Сан-Марино, Лихтенштейн, Андорра, Мальта', micro, 3),
    a('earth', '🛰️', 'Вокруг света', `${EARTH_KM.toLocaleString('ru-RU')} км по маршрутам`, f.routeKm, EARTH_KM),
    a('planner', '📋', 'Планировщик', '3 поездки в приложении', extra.tripsCreated, 3),
    a('diary', '📔', 'Летописец', '10 записей в дневнике', extra.diary, 10),
    a('money', '🧾', 'Бухгалтер', '20 расходов в поездках', extra.expenses, 20),
  ];
}
