import type { Deal } from './schema.ts';

/** Departure cities scanned every hour (Travelpayouts city codes). */
export const ORIGINS: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'MOW', name: 'Москва' },
  { code: 'LED', name: 'Санкт-Петербург' },
  { code: 'KZN', name: 'Казань' },
  { code: 'SVX', name: 'Екатеринбург' },
  { code: 'OVB', name: 'Новосибирск' },
  { code: 'KRR', name: 'Краснодар' },
  { code: 'AER', name: 'Сочи' },
];
/** Months ahead, including the current one. */
export const MONTHS_AHEAD = 6;
/** A deal is at least this much below the usual price… */
export const MIN_DISCOUNT = 0.35;
/** …and saves at least this many rubles. */
export const MIN_SAVING = 2000;
const HISTORY_DAYS = 45;
const MIN_HISTORY = 5;
const MIN_MONTHS = 4;

/** One row of Travelpayouts /aviasales/v3/prices_for_dates (cheapest found by Aviasales users in the last 48 h). */
export interface PriceRow {
  origin: string;
  destination: string;
  price: number;
  airline?: string;
  departure_at: string;
  transfers?: number;
  duration?: number;
  duration_to?: number;
  link?: string;
}

/** route-month → [day number (UTC), cheapest price that day] */
export type PriceHistory = Record<string, Array<[number, number]>>;

export const dayNumber = (d: Date): number => Math.floor(d.getTime() / 86400e3);
export const routeKey = (r: Pick<PriceRow, 'origin' | 'destination' | 'departure_at'>): string => `${r.origin}-${r.destination}-${r.departure_at.slice(0, 7)}`;

export function monthsFrom(now: Date, count = MONTHS_AHEAD): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/**
 * Usual price of a route in a month: the median of the daily cheapest prices seen on previous days.
 * Until a week of history is collected, the median of the cheapest prices of the same route over the next months is used.
 */
export function usualPrice(history: PriceHistory, row: PriceRow, today: number, routeMonthMins: readonly number[]): number | null {
  const past = (history[routeKey(row)] ?? []).filter(([d]) => d < today).map(([, p]) => p);
  if (past.length >= MIN_HISTORY) return median(past);
  if (routeMonthMins.length >= MIN_MONTHS) return median(routeMonthMins);
  return null;
}

export function aviasalesLink(link: string | undefined, marker: string, origin: string, destination: string, departAt: string): string {
  let url: string;
  if (link && link.startsWith('/')) url = `https://www.aviasales.ru${link}`;
  else {
    const d = departAt.slice(8, 10) + departAt.slice(5, 7);
    url = `https://www.aviasales.ru/search/${origin}${d}${destination}1`;
  }
  if (!marker) return url;
  return `${url}${url.includes('?') ? '&' : '?'}marker=${encodeURIComponent(marker)}`;
}

export interface Names {
  city: (code: string) => { name: string; country: string } | undefined;
  airline: (code: string) => string | undefined;
}

export function findDeals(rows: readonly PriceRow[], history: PriceHistory, now: Date, prev: readonly Deal[], names: Names, marker: string): Deal[] {
  const today = dayNumber(now);
  const byRoute = new Map<string, number[]>();
  for (const r of rows) {
    const k = `${r.origin}-${r.destination}`;
    byRoute.set(k, [...(byRoute.get(k) ?? []), r.price]);
  }
  const prevById = new Map(prev.map((d) => [d.id, d]));
  const deals: Deal[] = [];
  for (const r of rows) {
    if (!(r.price > 0) || Date.parse(r.departure_at) <= now.getTime()) continue;
    const usual = usualPrice(history, r, today, byRoute.get(`${r.origin}-${r.destination}`) ?? []);
    if (!usual) continue;
    const discount = 1 - r.price / usual;
    if (discount < MIN_DISCOUNT || usual - r.price < MIN_SAVING) continue;
    const id = `${r.origin}-${r.destination}-${r.departure_at.slice(0, 10)}`;
    const old = prevById.get(id);
    const dest = names.city(r.destination);
    deals.push({
      id,
      origin: r.origin,
      originName: names.city(r.origin)?.name ?? ORIGINS.find((o) => o.code === r.origin)?.name ?? r.origin,
      destination: r.destination,
      destinationName: dest?.name ?? r.destination,
      countryCode: dest?.country ?? '',
      price: Math.round(r.price),
      usual: Math.round(usual),
      discount: Math.round(discount * 100),
      departAt: r.departure_at,
      transfers: r.transfers ?? 0,
      airline: (r.airline && names.airline(r.airline)) || r.airline || '',
      durationMin: r.duration_to ?? r.duration ?? 0,
      link: aviasalesLink(r.link, marker, r.origin, r.destination, r.departure_at),
      foundAt: old && old.price === Math.round(r.price) ? old.foundAt : now.toISOString(),
    });
  }
  return deals.sort((a, b) => b.discount - a.discount || a.price - b.price).slice(0, 200);
}

/** Adds today's cheapest prices and forgets old days and past months. */
export function recordPrices(history: PriceHistory, rows: readonly PriceRow[], now: Date): PriceHistory {
  const today = dayNumber(now);
  const month = now.toISOString().slice(0, 7);
  const out: PriceHistory = {};
  for (const [k, list] of Object.entries(history)) {
    if (k.slice(-7) < month) continue;
    const kept = list.filter(([d]) => d > today - HISTORY_DAYS);
    if (kept.length) out[k] = kept;
  }
  for (const r of rows) {
    if (!(r.price > 0)) continue;
    const k = routeKey(r);
    const list = out[k] ?? (out[k] = []);
    const t = list.find(([d]) => d === today);
    if (t) t[1] = Math.min(t[1], Math.round(r.price));
    else list.push([today, Math.round(r.price)]);
  }
  return out;
}

// ---------- routes.json: the cheapest price of every scanned route and month (not only the deals)

/** City of a route: [name, country (ISO2), lat, lon]. */
export type RouteCity = [string, string, number | null, number | null];
/** [origin, destination, 'YYYY-MM', price, departure 'YYYY-MM-DD', transfers] */
export type RoutePrice = [string, string, string, number, string, number];
export interface RoutesFile {
  updatedAt: string;
  cities: Record<string, RouteCity>;
  prices: RoutePrice[];
}

/** One price per origin, destination and month: the cheapest. */
export function buildRoutes(rows: readonly PriceRow[], city: (code: string) => RouteCity | undefined, now: Date): RoutesFile {
  const best = new Map<string, PriceRow>();
  for (const r of rows) {
    if (!(r.price > 0) || Date.parse(r.departure_at) <= now.getTime()) continue;
    const k = routeKey(r);
    const b = best.get(k);
    if (!b || r.price < b.price) best.set(k, r);
  }
  const cities: Record<string, RouteCity> = {};
  const prices: RoutePrice[] = [];
  for (const r of best.values()) {
    for (const c of [r.origin, r.destination]) {
      const v = cities[c] ?? city(c);
      if (v) cities[c] = v;
    }
    prices.push([r.origin, r.destination, r.departure_at.slice(0, 7), Math.round(r.price), r.departure_at.slice(0, 10), r.transfers ?? 0]);
  }
  prices.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
  return { updatedAt: now.toISOString(), cities, prices };
}
