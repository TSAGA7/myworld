import { loadStatic } from './reference';

/** Airports with scheduled service (OurAirports, public domain): IATA code, name, city, country, position, time zone. */
export interface Airport {
  iata: string;
  name: string;
  city: string;
  countryId: string;
  lat: number;
  lon: number;
  tz: string;
  large: boolean;
}

type Row = [string, string, string, string, number, number, string, number];

let cache: Promise<Map<string, Airport>> | null = null;

export function loadAirports(): Promise<Map<string, Airport>> {
  cache ??= loadStatic<Row[]>('data/airports.json').then(
    (rows) => new Map(rows.map(([iata, name, city, countryId, lat, lon, tz, large]) => [iata, { iata, name, city, countryId, lat, lon, tz, large: !!large }])),
  );
  cache.catch(() => (cache = null));
  return cache;
}

/** Airports matching a code, a city or an airport name; bigger airports and exact codes first. */
export function searchAirports(all: Map<string, Airport>, q: string, limit = 6): Airport[] {
  const t = q.trim().toLowerCase();
  if (!t) return [];
  const code = t.toUpperCase();
  const hits: Array<[number, Airport]> = [];
  for (const a of all.values()) {
    let score = 0;
    if (a.iata === code) score = 100;
    else if (a.iata.startsWith(code)) score = 40;
    else if (a.city.toLowerCase().startsWith(t)) score = 60;
    else if (t.length >= 3 && a.name.toLowerCase().includes(t)) score = 20;
    if (score) hits.push([score + (a.large ? 10 : 0), a]);
  }
  return hits.sort((x, y) => y[0] - x[0]).slice(0, limit).map(([, a]) => a);
}
