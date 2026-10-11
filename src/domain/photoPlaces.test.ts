import { describe, expect, it } from 'vitest';
import { findTrips, overlaps, photoDay, type ResolvedPoint, summarize, tripTitle, validPoint } from './photoPlaces';

const p = (date: string | null, countryId: string, cityId: string | null = null): ResolvedPoint => ({ lat: 1, lon: 1, date, countryId, cityId });

describe('photo places', () => {
  it('reads the shooting day and drops broken dates and coordinates', () => {
    expect(photoDay(new Date(2024, 4, 3, 23, 59), '2026-10-11')).toBe('2024-05-03');
    expect(photoDay(new Date(1980, 0, 1), '2026-10-11')).toBeNull();
    expect(photoDay(new Date(2030, 0, 1), '2026-10-11')).toBeNull();
    expect(photoDay('2024-05-03', '2026-10-11')).toBeNull();
    expect(validPoint(41.01, 28.97)).toBe(true);
    expect(validPoint(0, 0)).toBe(false);
    expect(validPoint(95, 10)).toBe(false);
    expect(validPoint(undefined, 10)).toBe(false);
  });

  it('groups photos into countries and cities with first and last dates, newest first', () => {
    const r = summarize([
      p('2023-07-01', 'IT', 'rome'),
      p('2023-07-03', 'IT', 'florence'),
      p('2019-05-01', 'IT', 'rome'),
      p('2024-01-10', 'TR', 'ist'),
      p(null, 'TR', null),
    ]);
    expect(r.map((c) => c.countryId)).toEqual(['TR', 'IT']);
    const it = r[1]!;
    expect(it).toMatchObject({ first: '2019-05-01', last: '2023-07-03', photos: 3 });
    expect(it.cities.map((c) => c.cityId)).toEqual(['florence', 'rome']);
    expect(it.cities[1]).toMatchObject({ first: '2019-05-01', last: '2023-07-01', photos: 2 });
    expect(r[0]!.photos).toBe(2);
  });

  it('builds trips abroad from dates: small gaps join, a day at home splits', () => {
    const pts = [
      p('2024-05-01', 'RU', 'msk'),
      p('2024-05-02', 'TR', 'ist'),
      p('2024-05-02', 'TR', 'ist'),
      p('2024-05-05', 'TR', 'ant'), // gap of 3 days: same trip
      p('2024-05-06', 'GR', 'ath'),
      p('2024-05-07', 'RU', 'msk'), // home
      p('2024-05-08', 'GR', 'ath'), // new trip, the home day splits it
      p('2024-08-01', 'IT', null),
      p('2024-08-10', 'IT', 'rome'), // 9 days later: separate trip
      p(null, 'FR', 'paris'), // undated photos never make a trip
    ];
    const trips = findTrips(pts, 'RU');
    expect(trips.map((t) => [t.start, t.end])).toEqual([
      ['2024-05-02', '2024-05-06'],
      ['2024-05-08', '2024-05-08'],
      ['2024-08-01', '2024-08-01'],
      ['2024-08-10', '2024-08-10'],
    ]);
    expect(trips[0]).toMatchObject({ countryIds: ['TR', 'GR'], photos: 4 });
    expect(trips[0]!.stops).toEqual([
      { cityId: 'ist', countryId: 'TR', start: '2024-05-02', end: '2024-05-02' },
      { cityId: 'ant', countryId: 'TR', start: '2024-05-05', end: '2024-05-05' },
      { cityId: 'ath', countryId: 'GR', start: '2024-05-06', end: '2024-05-06' },
    ]);
    expect(trips[2]!.stops).toEqual([]);
  });

  it('names trips and spots overlaps with existing ones', () => {
    const name = (id: string) => ({ TR: 'Турция', GR: 'Греция', IT: 'Италия', FR: 'Франция' })[id] ?? id;
    const t = { start: '2024-05-02', end: '2024-05-06', countryIds: ['TR'], stops: [], photos: 1 };
    expect(tripTitle(t, name)).toBe('Турция, май 2024');
    expect(tripTitle({ ...t, countryIds: ['TR', 'GR'] }, name)).toBe('Турция и Греция, май 2024');
    expect(tripTitle({ ...t, countryIds: ['TR', 'GR', 'IT', 'FR'] }, name)).toBe('Турция, Греция и ещё 2, май 2024');
    expect(overlaps(t, '2024-05-06', '2024-05-10')).toBe(true);
    expect(overlaps(t, '2024-04-20', '2024-05-01')).toBe(false);
    expect(overlaps(t, '2024-05-04', null)).toBe(true);
    expect(overlaps(t, null, null)).toBe(false);
  });
});
