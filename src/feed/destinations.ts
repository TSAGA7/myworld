import type { RoutePrice, RoutesFile } from './deals.ts';
import type { Deal } from './schema.ts';

/**
 * Where tickets lead: coordinates of destinations, ski / surf destinations, matching tickets to a trip, price watch.
 * Pure logic (no React), tested in feed.test.ts.
 */

export interface Point {
  lat: number;
  lon: number;
}
const R = 6371;
export function km(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Travelpayouts city codes that are not airport codes: their main airport (airports.json has airports). */
export const CITY_AIRPORT: Readonly<Record<string, string>> = {
  MOW: 'SVO', BAK: 'GYD', RTW: 'GSV', IZM: 'ADB', TYO: 'NRT', LON: 'LHR', PAR: 'CDG', ROM: 'FCO', MIL: 'MXP', BJS: 'PEK',
  SHA: 'PVG', NYC: 'JFK', BUH: 'OTP', STO: 'ARN', OSA: 'KIX', SEL: 'ICN', WAS: 'IAD', CHI: 'ORD', YTO: 'YYZ', SAO: 'GRU',
  RIO: 'GIG', BUE: 'EZE', JKT: 'CGK', BER: 'BER', REK: 'KEF', NAP: 'NAP', VCE: 'VCE', OSL: 'OSL', HEL: 'HEL',
};

export type AirportCoords = ReadonlyMap<string, Point & { country: string }>;

/** Coordinates of a city code: routes.json first, then its airport. */
export function cityPoint(code: string, routes: RoutesFile | null, airports: AirportCoords): Point | null {
  const c = routes?.cities[code];
  if (c && c[2] !== null && c[3] !== null) return { lat: c[2], lon: c[3] };
  const a = airports.get(code) ?? airports.get(CITY_AIRPORT[code] ?? '');
  return a ? { lat: a.lat, lon: a.lon } : null;
}

/** A ski area this close to the airport counts (Минводы → Эльбрус ~120 km by air line, Сочи → Красная Поляна ~35). */
export const SKI_KM = 150;
/** A surf spot this close to the airport counts (Денпасар → Улувату ~20 km). */
export const SURF_KM = 120;

/** Destination codes near ski resorts / surf spots. */
export function hobbyDestinations(codes: Iterable<string>, point: (code: string) => Point | null, resorts: readonly Point[], spots: readonly Point[]): { ski: Set<string>; surf: Set<string> } {
  const ski = new Set<string>();
  const surf = new Set<string>();
  for (const code of codes) {
    const p = point(code);
    if (!p) continue;
    if (resorts.some((r) => Math.abs(r.lat - p.lat) < 2.5 && km(p, r) <= SKI_KM)) ski.add(code);
    if (spots.some((s) => Math.abs(s.lat - p.lat) < 1.5 && km(p, s) <= SURF_KM)) surf.add(code);
  }
  return { ski, surf };
}

/** Which tickets the feed shows: travels → everything; a hobby alone → its places; several → chips to choose. */
export type DestKind = 'all' | 'ski' | 'surf';
export function destKinds(travel: boolean, rider: boolean, surf: boolean): DestKind[] {
  const hob: DestKind[] = [...(rider ? (['ski'] as const) : []), ...(surf ? (['surf'] as const) : [])];
  if (travel || !hob.length) return ['all', ...hob];
  return hob;
}

// ---------- a trip: «Выгодные забросы»

export interface TripFocus {
  title: string;
  start: string;
  end: string;
  countries: string[];
  /** Cities of the route (where to fly). */
  cities: Array<{ name: string; countryId: string } & Point>;
}

/** The departure city of the scanner nearest to home (Москва when home is not set). */
export function nearestOrigin(home: Point | null, origins: ReadonlyArray<{ code: string }>, point: (code: string) => Point | null): string {
  const first = origins[0]?.code ?? 'MOW';
  if (!home) return first;
  let best: { code: string; d: number } | null = null;
  for (const o of origins) {
    const p = point(o.code);
    if (!p) continue;
    const d = km(home, p);
    if (!best || d < best.d) best = { code: o.code, d };
  }
  return best?.code ?? first;
}

const DAY = 86400e3;
const day = (iso: string) => Math.floor(Date.parse(iso.slice(0, 10)) / DAY);

/** A destination fits the trip: in one of its countries, or within 250 km of a city of the route. */
export function fitsPlace(f: TripFocus, country: string, p: Point | null): boolean {
  if (country && f.countries.includes(country)) return true;
  return !!p && f.cities.some((c) => km(c, p) <= 250);
}

/** A ticket fits the trip: the place fits and it departs from 3 days before the start to the start day. */
export function fitsTrip(f: TripFocus, deal: Pick<Deal, 'countryCode' | 'departAt' | 'destination'>, p: Point | null): boolean {
  if (!fitsPlace(f, deal.countryCode, p)) return false;
  const d = day(deal.departAt);
  return d >= day(f.start) - 3 && d <= day(f.start);
}

/** Cheapest scanned prices (any, not only deals) from `origin` to the trip's places in the month of the start, cheapest first. */
export function tripPrices(f: TripFocus, origin: string, routes: RoutesFile | null, point: (code: string) => Point | null): RoutePrice[] {
  if (!routes) return [];
  const month = f.start.slice(0, 7);
  return routes.prices
    .filter((r) => r[0] === origin && r[2] === month && fitsPlace(f, routes.cities[r[1]]?.[1] ?? '', point(r[1])))
    .sort((a, b) => a[3] - b[3])
    .slice(0, 5);
}

const ddmm = (iso: string) => iso.slice(8, 10) + iso.slice(5, 7);
/** Aviasales search for exact dates: there and back (back omitted when there is no end date). */
export function searchUrl(origin: string, dest: string, start: string, end: string | null): string {
  return `https://www.aviasales.ru/search/${origin}${ddmm(start)}${dest}${end ? ddmm(end) : ''}1`;
}

/** The airport nearest to a point. */
export function nearestAirport(p: Point, airports: AirportCoords): string | null {
  let best: { code: string; d: number } | null = null;
  for (const [code, a] of airports) {
    if (Math.abs(a.lat - p.lat) > 3) continue;
    const d = km(p, a);
    if (!best || d < best.d) best = { code, d };
  }
  return best && best.d < 400 ? best.code : null;
}

// ---------- price watch («колокольчик»)

export interface PriceWatch {
  /** origin-destination-YYYY-MM */
  id: string;
  origin: string;
  originName: string;
  destination: string;
  destinationName: string;
  month: string;
  /** Price when the bell was pressed and the last price the user saw. */
  startPrice: number;
  seenPrice: number;
  at: string;
}
export const watchId = (origin: string, destination: string, departAt: string) => `${origin}-${destination}-${departAt.slice(0, 7)}`;

/** The cheapest current price of a watched route (deals and routes.json), or null when the scan has none. */
export function currentPrice(w: PriceWatch, deals: readonly Deal[], routes: RoutesFile | null): number | null {
  const prices = [
    ...deals.filter((d) => d.origin === w.origin && d.destination === w.destination && d.departAt.startsWith(w.month)).map((d) => d.price),
    ...(routes?.prices ?? []).filter((r) => r[0] === w.origin && r[1] === w.destination && r[2] === w.month).map((r) => r[3]),
  ];
  return prices.length ? Math.min(...prices) : null;
}
