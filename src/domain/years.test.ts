import { describe, expect, it } from 'vitest';
import type { Trip, Visit } from './model';
import { bestYear, countriesPerYear, visitedLabel, yearsByCountry } from './years';

const NOW = '2026-01-01T00:00:00.000Z';
const v = (key: string, countryId: string, extra: Partial<Visit> = {}): Visit => ({
  id: key, key, cityId: key.startsWith('city:') ? key.slice(5) : null, countryId, date: null, tripIds: [], years: [], manual: true, createdAt: NOW, updatedAt: NOW, ...extra,
});
const trip = (id: string, startDate: string) => ({ id, startDate, endDate: startDate }) as Trip;

describe('visit years', () => {
  const visits = [
    v('country:AU', 'AU', { years: [2022, 2023] }),
    v('city:rome', 'IT', { date: '2022-05-01' }),
    v('city:milan', 'IT', { tripIds: ['t1', 'future'] }),
    v('country:TR', 'TR', { years: [2022], date: '2022-07-01' }),
    v('country:GE', 'GE'),
  ];
  const years = yearsByCountry(visits, [trip('t1', '2024-03-01'), trip('future', '2027-01-01')], '2026-11-02');

  it('joins years by hand, visit dates and past trips', () => {
    expect(years.get('AU')).toEqual({ all: [2022, 2023], derived: [], manual: [2022, 2023] });
    expect(years.get('IT')).toEqual({ all: [2022, 2024], derived: [2022, 2024], manual: [] });
    expect(years.get('TR')?.all).toEqual([2022]);
    expect(years.get('GE')?.all).toEqual([]);
  });

  it('counts countries per year and finds the best one', () => {
    const per = countriesPerYear(years);
    expect(per.map((y) => [y.year, y.countries])).toEqual([[2024, 1], [2023, 1], [2022, 3]]);
    expect(bestYear(per)?.year).toBe(2022);
    expect(countriesPerYear(years, new Set(['AU'])).map((y) => y.year)).toEqual([2023, 2022]);
    // A tie goes to the later year.
    expect(bestYear([{ year: 2021, countries: 2, ids: [] }, { year: 2025, countries: 2, ids: [] }])?.year).toBe(2025);
  });

  it('labels a country with its years', () => {
    expect(visitedLabel([2022, 2023], true)).toBe('Посещена в 2022, 2023');
    expect(visitedLabel([], true)).toBe('Посещена');
    expect(visitedLabel([2020], false)).toBe('Посещён в 2020');
  });
});
