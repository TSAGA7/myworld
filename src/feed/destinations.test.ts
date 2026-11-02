import { describe, expect, it } from 'vitest';
import { buildRoutes, type PriceRow, type RoutesFile } from './deals';
import { currentPrice, destKinds, fitsTrip, hobbyDestinations, nearestOrigin, searchUrl, tripPrices, type PriceWatch, type TripFocus } from './destinations';

const P: Record<string, { lat: number; lon: number }> = {
  MOW: { lat: 55.75, lon: 37.62 }, LED: { lat: 59.94, lon: 30.31 }, KZN: { lat: 55.79, lon: 49.12 },
  MRV: { lat: 44.22, lon: 43.08 }, AER: { lat: 43.45, lon: 39.95 }, DPS: { lat: -8.75, lon: 115.17 }, EVN: { lat: 40.15, lon: 44.4 }, IST: { lat: 41.28, lon: 28.75 },
};
const point = (c: string) => P[c] ?? null;
const elbrus = { lat: 43.28, lon: 42.46 };
const rosa = { lat: 43.63, lon: 40.31 };
const uluwatu = { lat: -8.83, lon: 115.09 };

describe('ticket destinations', () => {
  it('finds airports near ski resorts and surf spots', () => {
    const { ski, surf } = hobbyDestinations(['MRV', 'AER', 'DPS', 'IST'], point, [elbrus, rosa], [uluwatu]);
    expect([...ski].sort()).toEqual(['AER', 'MRV']);
    expect([...surf]).toEqual(['DPS']);
  });

  it('offers chips by the hobbies that are on', () => {
    expect(destKinds(true, false, false)).toEqual(['all']);
    expect(destKinds(true, true, true)).toEqual(['all', 'ski', 'surf']);
    expect(destKinds(false, true, false)).toEqual(['ski']);
    expect(destKinds(false, false, false)).toEqual(['all']);
  });

  it('flies from the nearest scanned city', () => {
    expect(nearestOrigin({ lat: 55.48, lon: 37.3 }, [{ code: 'MOW' }, { code: 'LED' }, { code: 'KZN' }], point)).toBe('MOW');
    expect(nearestOrigin({ lat: 55.8, lon: 49.0 }, [{ code: 'MOW' }, { code: 'KZN' }], point)).toBe('KZN');
    expect(nearestOrigin(null, [{ code: 'LED' }], point)).toBe('LED');
  });

  const trip: TripFocus = { title: 'Армения', start: '2026-12-17', end: '2026-12-21', countries: ['AM'], cities: [{ name: 'Ереван', countryId: 'AM', ...P.EVN! }] };
  it('matches tickets to a trip by place and departure date', () => {
    const deal = (departAt: string, countryCode = 'AM') => ({ countryCode, departAt, destination: 'EVN' });
    expect(fitsTrip(trip, deal('2026-12-17T08:00:00+03:00'), point('EVN'))).toBe(true);
    expect(fitsTrip(trip, deal('2026-12-14T08:00:00+03:00'), point('EVN'))).toBe(true);
    expect(fitsTrip(trip, deal('2026-12-18T08:00:00+03:00'), point('EVN'))).toBe(false);
    expect(fitsTrip(trip, deal('2026-12-17T08:00:00+03:00', 'TR'), point('IST'))).toBe(false);
    expect(searchUrl('MOW', 'EVN', '2026-12-17', '2026-12-21')).toBe('https://www.aviasales.ru/search/MOW1712EVN21121');
  });

  it('keeps the cheapest price of each route and month, and reads it for trips and the price watch', () => {
    const now = new Date('2026-11-02T12:00:00Z');
    const rows: PriceRow[] = [
      { origin: 'MOW', destination: 'EVN', price: 12000, departure_at: '2026-12-05T10:00:00+03:00' },
      { origin: 'MOW', destination: 'EVN', price: 9000, departure_at: '2026-12-20T10:00:00+03:00', transfers: 0 },
      { origin: 'MOW', destination: 'IST', price: 7000, departure_at: '2026-12-01T10:00:00+03:00' },
    ];
    const routes: RoutesFile = buildRoutes(rows, (c) => (c === 'EVN' ? ['Ереван', 'AM', 40.15, 44.4] : c === 'IST' ? ['Стамбул', 'TR', 41.28, 28.75] : ['Москва', 'RU', 55.75, 37.62]), now);
    expect(routes.prices).toEqual([
      ['MOW', 'EVN', '2026-12', 9000, '2026-12-20', 0],
      ['MOW', 'IST', '2026-12', 7000, '2026-12-01', 0],
    ]);
    expect(tripPrices(trip, 'MOW', routes, point).map((r) => r[1])).toEqual(['EVN']);
    const w: PriceWatch = { id: 'MOW-EVN-2026-12', origin: 'MOW', originName: 'Москва', destination: 'EVN', destinationName: 'Ереван', month: '2026-12', startPrice: 10000, seenPrice: 10000, at: '' };
    expect(currentPrice(w, [], routes)).toBe(9000);
    expect(currentPrice({ ...w, destination: 'TBS' }, [], routes)).toBeNull();
  });
});
