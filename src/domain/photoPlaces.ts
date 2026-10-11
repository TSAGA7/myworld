/**
 * "Где я был" по фото: точки съёмки (координаты и дата из EXIF) → страны, города и поездки.
 * Чистая логика без браузера и базы: геопривязка точек делается снаружи (src/geo/photoGeo.ts).
 */

export interface PhotoPoint {
  lat: number;
  lon: number;
  /** Local shooting day "YYYY-MM-DD", or null when the photo has no date. */
  date: string | null;
}

export interface ResolvedPoint extends PhotoPoint {
  countryId: string;
  cityId: string | null;
}

export interface FoundCity {
  cityId: string;
  countryId: string;
  first: string | null;
  last: string | null;
  photos: number;
}

export interface FoundCountry {
  countryId: string;
  first: string | null;
  last: string | null;
  photos: number;
  cities: FoundCity[];
}

export interface FoundStop {
  cityId: string;
  countryId: string;
  start: string | null;
  end: string | null;
}

export interface FoundTrip {
  start: string;
  end: string;
  /** Countries in the order they were first photographed. */
  countryIds: string[];
  stops: FoundStop[];
  photos: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Shooting day from an EXIF date (exifr returns the camera's wall-clock time as a local Date). Absurd dates are dropped. */
export function photoDay(d: unknown, today: string): string | null {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return day < '1990-01-01' || day > today ? null : day;
}

/** Valid coordinates; (0, 0) is what broken cameras write when they have no fix. */
export const validPoint = (lat: unknown, lon: unknown): boolean =>
  typeof lat === 'number' &&
  typeof lon === 'number' &&
  Number.isFinite(lat) &&
  Number.isFinite(lon) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lon) <= 180 &&
  !(Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6);

const minDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a < b ? a : b);
const maxDate = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);

/** Countries with their cities, newest first (undated last). */
export function summarize(points: readonly ResolvedPoint[]): FoundCountry[] {
  const countries = new Map<string, FoundCountry & { byCity: Map<string, FoundCity> }>();
  for (const p of points) {
    let c = countries.get(p.countryId);
    if (!c) countries.set(p.countryId, (c = { countryId: p.countryId, first: null, last: null, photos: 0, cities: [], byCity: new Map() }));
    c.photos++;
    c.first = minDate(c.first, p.date);
    c.last = maxDate(c.last, p.date);
    if (!p.cityId) continue;
    let city = c.byCity.get(p.cityId);
    if (!city) c.byCity.set(p.cityId, (city = { cityId: p.cityId, countryId: p.countryId, first: null, last: null, photos: 0 }));
    city.photos++;
    city.first = minDate(city.first, p.date);
    city.last = maxDate(city.last, p.date);
  }
  const byNewest = (a: { last: string | null; photos: number }, b: { last: string | null; photos: number }) =>
    (b.last ?? '').localeCompare(a.last ?? '') || b.photos - a.photos;
  return [...countries.values()]
    .map(({ byCity, ...c }) => ({ ...c, cities: [...byCity.values()].sort(byNewest) }))
    .sort(byNewest);
}

const dayNum = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86_400_000;

/**
 * Trips abroad: days with photos outside the home country, grouped while the gap between them is at most
 * `maxGap` days and no day in between was photographed only at home.
 */
export function findTrips(points: readonly ResolvedPoint[], homeCountryId: string, maxGap = 3): FoundTrip[] {
  const homeDays = new Set<string>();
  const abroadDays = new Set<string>();
  for (const p of points) {
    if (!p.date) continue;
    (p.countryId === homeCountryId ? homeDays : abroadDays).add(p.date);
  }
  const onlyHome = [...homeDays].filter((d) => !abroadDays.has(d)).map(dayNum);
  const days = [...abroadDays].sort();
  const groups: string[][] = [];
  for (const d of days) {
    const g = groups[groups.length - 1];
    const prev = g?.[g.length - 1];
    if (g && prev && dayNum(d) - dayNum(prev) <= maxGap && !onlyHome.some((h) => h > dayNum(prev) && h < dayNum(d))) g.push(d);
    else groups.push([d]);
  }
  return groups.map((g) => {
    const start = g[0] ?? '';
    const end = g[g.length - 1] ?? start;
    const inside = points
      .filter((p): p is ResolvedPoint & { date: string } => !!p.date && p.countryId !== homeCountryId && p.date >= start && p.date <= end)
      .sort((a, b) => a.date.localeCompare(b.date));
    const countryIds: string[] = [];
    const stops = new Map<string, FoundStop>();
    for (const p of inside) {
      if (!countryIds.includes(p.countryId)) countryIds.push(p.countryId);
      if (!p.cityId) continue;
      const s = stops.get(p.cityId);
      if (s) s.end = p.date;
      else stops.set(p.cityId, { cityId: p.cityId, countryId: p.countryId, start: p.date, end: p.date });
    }
    return { start, end, countryIds, stops: [...stops.values()], photos: inside.length };
  });
}

/** A found trip that overlaps a trip the user already has is not offered again. */
export const overlaps = (t: { start: string; end: string }, startDate: string | null, endDate: string | null): boolean => {
  const s = startDate ?? endDate;
  const e = endDate ?? startDate;
  return !!s && !!e && s <= t.end && e >= t.start;
};

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** "Турция, май 2024", "Италия и Франция, июль 2023", "Таиланд, Вьетнам и ещё 2, янв 2020". */
export function tripTitle(t: FoundTrip, name: (countryId: string) => string): string {
  const names = t.countryIds.map(name);
  const who =
    names.length <= 1 ? (names[0] ?? 'Поездка') : names.length === 2 ? `${names[0]} и ${names[1]}` : `${names[0]}, ${names[1]} и ещё ${names.length - 2}`;
  const month = MONTHS[Number(t.start.slice(5, 7)) - 1] ?? '';
  return `${who}, ${month} ${t.start.slice(0, 4)}`;
}
