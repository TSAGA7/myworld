import { describe, expect, it } from 'vitest';
import { daysBetween, formatRange, nights, plural, tripStatus } from './dates';
import type { PlannedMark, Trip, TripStop, Visit } from './model';
import { indexItems, normalize, search } from './search';
import { buildAddToMap, buildMarkVisited, previewAddToMap, previewMarkVisited, tripPlaces } from './tripToMap';
import { type CountryRef, deriveWorld, worldProgress } from './world';

const NOW = '2026-10-11T00:00:00+03:00';
let n = 0;
const newId = () => `id${++n}`;

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: 't1',
  title: 'Италия и Швейцария',
  startDate: '2026-09-10',
  endDate: '2026-09-20',
  countryIds: ['IT', 'CH'],
  note: '',
  coverId: null,
  members: [],
  dailyBudget: null,
  dailyBudgetCurrency: '',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});
const stop = (id: string, cityId: string, countryId: string, order: number, startDate: string | null = null, tripId = 't1'): TripStop => ({
  id,
  tripId,
  order,
  cityId,
  countryId,
  startDate,
  endDate: null,
  note: '',
  createdAt: NOW,
  updatedAt: NOW,
});
const STOPS = [
  stop('s1', 'rome', 'IT', 0, '2026-09-10'),
  stop('s2', 'florence', 'IT', 1, '2026-09-13'),
  stop('s3', 'milan', 'IT', 2),
  stop('s4', 'zurich', 'CH', 3, '2026-09-18'),
  stop('s5', 'rome', 'IT', 4), // back to Rome: same city twice in the route
];

/** Applies ops the way the storage layer does: one record per key. */
function apply<T extends { key: string }>(rows: T[], ops: { creates: T[]; updates: T[] }): T[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  for (const c of ops.creates) {
    expect(byKey.has(c.key)).toBe(false);
    byKey.set(c.key, c);
  }
  for (const u of ops.updates) byKey.set(u.key, u);
  return [...byKey.values()];
}

describe('dates', () => {
  it('computes trip status from dates', () => {
    expect(tripStatus('2026-10-12', '2026-10-20', '2026-10-11')).toBe('upcoming');
    expect(tripStatus('2026-10-11', '2026-10-20', '2026-10-11')).toBe('ongoing');
    expect(tripStatus('2026-10-01', '2026-10-11', '2026-10-11')).toBe('ongoing');
    expect(tripStatus('2026-10-01', '2026-10-10', '2026-10-11')).toBe('completed');
    expect(tripStatus(null, null, '2026-10-11')).toBe('upcoming');
  });
  it('counts days across DST changes without drift', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    expect(nights('2026-09-10', '2026-09-20')).toBe(10);
  });
  it('formats ranges and plurals', () => {
    expect(formatRange('2026-09-10', '2026-09-20')).toBe('10–20 сен 2026');
    expect(formatRange('2026-12-30', '2027-01-05')).toBe('30 дек 2026 – 5 янв 2027');
    expect(plural(21, 'страна', 'страны', 'стран')).toBe('страна');
    expect(plural(12, 'страна', 'страны', 'стран')).toBe('стран');
    expect(plural(34, 'страна', 'страны', 'стран')).toBe('страны');
  });
});

describe('world statistics', () => {
  const countries = [
    { id: 'IT', m195: true, un: true, type: 'Sovereign country' },
    { id: 'CH', m195: true, un: true, type: 'Sovereign country' },
    { id: 'VA', m195: true, un: false, type: 'Sovereign country' },
    { id: 'GL', m195: false, un: false, type: 'Country' },
  ] as CountryRef[];
  const visit = (key: string, cityId: string | null, countryId: string, date: string | null = null): Visit => ({
    id: key, key, cityId, countryId, date, tripIds: [], manual: true, createdAt: NOW, updatedAt: NOW,
  });

  it('counts unique countries and cities, visits beat plans', () => {
    const visits = [visit('city:rome', 'rome', 'IT', '2019-05-01'), visit('city:milan', 'milan', 'IT', '2018-01-02'), visit('country:GL', null, 'GL')];
    const plans: PlannedMark[] = [
      { id: 'p1', key: 'city:rome', cityId: 'rome', countryId: 'IT', tripIds: ['t1'], manual: false, createdAt: NOW, updatedAt: NOW },
      { id: 'p2', key: 'city:zurich', cityId: 'zurich', countryId: 'CH', tripIds: ['t1'], manual: false, createdAt: NOW, updatedAt: NOW },
    ];
    const w = deriveWorld(visits, plans, STOPS);
    expect([...w.visitedCountryIds].sort()).toEqual(['GL', 'IT']);
    expect(w.visitedCityIds.size).toBe(2);
    expect(w.cityStatus.get('rome')).toBe('visited');
    expect(w.cityStatus.get('zurich')).toBe('planned');
    expect(w.countryStatus.get('CH')).toBe('planned');
    expect(w.visitedCitiesByCountry.get('IT')).toBe(2);
    expect(w.firstVisitByCountry.get('IT')).toBe('2018-01-02');
    expect(w.cityTripCount.get('rome')).toBe(1);

    const p195 = worldProgress(countries, w.visitedCountryIds, 'm195');
    expect(p195).toEqual({ visited: 1, total: 3, remaining: 2, percent: 33.3 });
    expect(worldProgress(countries, w.visitedCountryIds, 'un193').total).toBe(2);
    expect(worldProgress(countries, w.visitedCountryIds, 'all').visited).toBe(2);
  });
});

describe('trip → map', () => {
  it('lists unique places in route order plus countries without stops', () => {
    const places = tripPlaces(trip({ countryIds: ['IT', 'CH', 'AT'] }), STOPS);
    expect(places.map((p) => p.key)).toEqual(['city:rome', 'city:florence', 'city:milan', 'city:zurich', 'country:AT']);
  });

  it('adds cities as planned, reports what was already there, and is idempotent', () => {
    const t = trip();
    let plans: PlannedMark[] = [
      { id: 'old', key: 'city:milan', cityId: 'milan', countryId: 'IT', tripIds: ['t0'], manual: false, createdAt: NOW, updatedAt: NOW },
    ];
    const visits: Visit[] = [
      { id: 'v', key: 'city:florence', cityId: 'florence', countryId: 'IT', date: '2015-01-01', tripIds: [], manual: true, createdAt: NOW, updatedAt: NOW },
    ];
    const pv = previewAddToMap(t, STOPS, plans, visits);
    expect(pv.added).toBe(2); // rome, zurich
    expect(pv.already).toBe(2); // florence visited, milan planned by another trip
    const ops = buildAddToMap(t, pv, plans, NOW, newId);
    expect(ops.creates.map((c) => c.key).sort()).toEqual(['city:rome', 'city:zurich']);
    expect(ops.updates.map((u) => u.tripIds)).toEqual([['t0', 't1']]);
    plans = apply(plans, ops);

    const again = buildAddToMap(t, previewAddToMap(t, STOPS, plans, visits), plans, NOW, newId);
    expect(again).toEqual({ creates: [], updates: [] });
    // Planned cities never become visited by this operation.
    const w = deriveWorld(visits, plans, STOPS);
    expect(w.cityStatus.get('rome')).toBe('planned');
    expect(w.visitedCityIds.has('rome')).toBe(false);
  });

  it('marks only selected places visited, keeps existing dates unless asked, and is idempotent', () => {
    const t = trip();
    let visits: Visit[] = [
      { id: 'v', key: 'city:florence', cityId: 'florence', countryId: 'IT', date: '2015-01-01', tripIds: [], manual: true, createdAt: NOW, updatedAt: NOW },
    ];
    const items = previewMarkVisited(t, STOPS, visits);
    const florence = items.find((i) => i.key === 'city:florence');
    expect(florence?.dateConflict).toBe(true);
    expect(items.find((i) => i.key === 'city:milan')?.proposedDate).toBe('2026-09-10'); // no stop date → trip start

    const selected = new Set(['city:rome', 'city:florence', 'city:milan']);
    const ops = buildMarkVisited(t, items, selected, new Set(), NOW, newId);
    expect(ops.creates.map((c) => c.key).sort()).toEqual(['city:milan', 'city:rome']);
    expect(ops.updates).toHaveLength(1);
    expect(ops.updates[0]?.date).toBe('2015-01-01'); // kept
    expect(ops.updates[0]?.tripIds).toEqual(['t1']);
    visits = apply(visits, ops);

    const w = deriveWorld(visits, [], STOPS);
    expect(w.visitedCityIds.size).toBe(3);
    expect(w.visitedCityIds.has('zurich')).toBe(false); // not selected

    const again = buildMarkVisited(t, previewMarkVisited(t, STOPS, visits), selected, new Set(), NOW, newId);
    expect(again).toEqual({ creates: [], updates: [] });

    const replaced = buildMarkVisited(t, previewMarkVisited(t, STOPS, visits), new Set(['city:florence']), new Set(['city:florence']), NOW, newId);
    expect(replaced.updates[0]?.date).toBe('2026-09-13');
  });
});

describe('search', () => {
  const items = [
    { name: 'Рим', en: 'Rome', pop: 3_000_000 },
    { name: 'Римини', en: 'Rimini', pop: 150_000 },
    { name: 'Цюрих', en: 'Zürich', pop: 1_100_000 },
    { name: 'Сан-Марино', en: 'San Marino', pop: 30_000 },
  ];
  const idx = indexItems(items, (i) => [i.name, i.en]);
  it('normalizes accents, case and ё', () => {
    expect(normalize('Zürich')).toBe('zurich');
    expect(normalize('Ёлка-Пёлка')).toBe('елка пелка');
  });
  it('ranks exact, prefix and word matches', () => {
    expect(search(idx, 'рим', 5, (i) => i.pop).map((i) => i.name)).toEqual(['Рим', 'Римини']);
    expect(search(idx, 'zurich', 5).map((i) => i.name)).toEqual(['Цюрих']);
    expect(search(idx, 'марино', 5).map((i) => i.name)).toEqual(['Сан-Марино']);
    expect(search(idx, '', 5)).toEqual([]);
  });
});

import { convert, formatMoney, tripCost } from './money';

describe('money', () => {
  const rates = { USD: 80, EUR: 100 };
  it('converts through rubles', () => {
    expect(convert(100, 'USD', 'RUB', rates)).toBe(8000);
    expect(convert(100, 'EUR', 'USD', rates)).toBe(125);
    expect(convert(500, 'RUB', 'RUB', rates)).toBe(500);
  });
  it('sums a trip by category, skipping unknown currencies and empty prices', () => {
    const c = tripCost(
      {
        transport: [{ price: 100, currency: 'EUR' }, { price: 5000, currency: 'RUB' }, { price: null, currency: '' }],
        stays: [{ price: 200, currency: 'USD' }],
        bookings: [{ price: 30, currency: 'CHF' }, { price: 1000, currency: '' }],
      },
      'RUB',
      rates,
    );
    expect(c.lines.map((l) => [l.key, l.total, l.count])).toEqual([
      ['transport', 15000, 2],
      ['stays', 16000, 1],
      ['bookings', 1000, 1],
    ]);
    expect(c.total).toBe(32000);
    expect(c.skipped).toEqual([{ amount: 30, currency: 'CHF' }]);
    expect(c.unpriced).toBe(1);
  });
  it('formats', () => {
    expect(formatMoney(12500, 'RUB').replace(/\s/g, ' ')).toBe('12 500 ₽');
    expect(formatMoney(1250.5, 'USD').replace(/\s/g, ' ')).toBe('1 250,5 $');
  });
});
