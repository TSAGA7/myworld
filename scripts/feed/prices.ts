/**
 * Price scanner: feed/deals.json — tickets far below their usual price (run hourly by .github/workflows/feed.yml).
 *   TRAVELPAYOUTS_TOKEN=… [TRAVELPAYOUTS_MARKER=…] node --experimental-strip-types scripts/feed/prices.ts
 * Data: Travelpayouts / Aviasales Data API — the cheapest tickets found by Aviasales users in the last 48 hours.
 * History of daily prices is kept in feed/prices-history.json (45 days) and is the "usual price" of each route.
 */
import { buildRoutes, findDeals, monthsFrom, ORIGINS, recordPrices, type Names, type PriceHistory, type PriceRow, type RouteCity } from '../../src/feed/deals.ts';
import type { DealsFile } from '../../src/feed/schema.ts';
import { fetchText, readJson, writeJson } from './io.ts';

const token = process.env.TRAVELPAYOUTS_TOKEN?.trim();
const marker = process.env.TRAVELPAYOUTS_MARKER?.trim() ?? '';
if (!token) {
  console.log('TRAVELPAYOUTS_TOKEN не задан — сканер цен пропущен');
  process.exit(0);
}

const API = 'https://api.travelpayouts.com';
const now = new Date();

type CityRow = { code: string; name: string | null; country_code: string; name_translations?: { en?: string }; coordinates?: { lat?: number; lon?: number } | null };
type AirlineRow = { code: string; name: string | null; name_translations?: { en?: string } };
const [cities, airlines] = await Promise.all([
  fetchText(`${API}/data/ru/cities.json`, {}, 60_000).then((t) => JSON.parse(t) as CityRow[]),
  fetchText(`${API}/data/ru/airlines.json`, {}, 60_000).then((t) => JSON.parse(t) as AirlineRow[]).catch(() => [] as AirlineRow[]),
]);
const cityBy = new Map(cities.map((c) => [c.code, { name: c.name || c.name_translations?.en || c.code, country: c.country_code ?? '', lat: c.coordinates?.lat ?? null, lon: c.coordinates?.lon ?? null }]));
const routeCity = (code: string): RouteCity | undefined => {
  const c = cityBy.get(code);
  return c ? [c.name, c.country, c.lat, c.lon] : undefined;
};
const airlineBy = new Map(airlines.map((a) => [a.code, a.name || a.name_translations?.en || a.code]));
const names: Names = { city: (c) => cityBy.get(c), airline: (c) => airlineBy.get(c) };

async function cheapestByDestination(origin: string, month: string): Promise<PriceRow[]> {
  const q = new URLSearchParams({ origin, departure_at: month, one_way: 'true', direct: 'false', unique: 'true', sorting: 'route', currency: 'rub', market: 'ru', limit: '1000', page: '1' });
  const body = JSON.parse(await fetchText(`${API}/aviasales/v3/prices_for_dates?${q}`, { headers: { 'x-access-token': token as string } })) as { success?: boolean; data?: PriceRow[]; error?: string };
  if (body.success === false) throw new Error(body.error ?? 'ошибка API');
  return (body.data ?? []).filter((r) => r.origin === origin && r.destination !== origin);
}

const jobs = ORIGINS.flatMap((o) => monthsFrom(now).map((m) => ({ origin: o.code, month: m })));
const rows: PriceRow[] = [];
let failed = 0;
for (let i = 0; i < jobs.length; i += 4) {
  const part = await Promise.all(
    jobs.slice(i, i + 4).map((j) =>
      cheapestByDestination(j.origin, j.month).catch((e: unknown) => {
        failed++;
        console.log(`✗ ${j.origin} ${j.month}: ${e instanceof Error ? e.message : e}`);
        return [];
      }),
    ),
  );
  rows.push(...part.flat());
}
if (!rows.length) {
  console.error(`Ни одного ответа от Travelpayouts (${failed} ошибок) — проверьте токен`);
  process.exit(1);
}

const history = readJson<PriceHistory>('prices-history.json') ?? {};
const prev = readJson<DealsFile>('deals.json');
const deals = findDeals(rows, history, now, prev?.deals ?? [], names, marker);
writeJson('prices-history.json', recordPrices(history, rows, now));
writeJson('deals.json', { updatedAt: now.toISOString(), origins: ORIGINS.map((o) => ({ ...o })), deals } satisfies DealsFile);
// Every route's cheapest price: trips («Выгодные забросы»), price watch and hobby filters read it.
const routes = buildRoutes(rows, routeCity, now);
writeJson('routes.json', routes);
console.log(`routes.json: ${routes.prices.length} цен, ${Object.keys(routes.cities).length} городов`);
console.log(`deals.json: ${deals.length} выгодных из ${rows.length} цен (${jobs.length - failed}/${jobs.length} запросов)`);
