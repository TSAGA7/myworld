import type { Trip, Visit } from './model';

/** Earliest year the picker offers; nobody keeps travel records from before that. */
export const MIN_YEAR = 1950;

const yearOf = (d: string | null | undefined): number | null => {
  const y = d ? Number(d.slice(0, 4)) : NaN;
  return Number.isInteger(y) && y >= MIN_YEAR ? y : null;
};

/** Cleans a list of years: whole numbers in range, no repeats, ascending. */
export function normalizeYears(years: readonly number[], maxYear: number): number[] {
  return [...new Set(years.filter((y) => Number.isInteger(y) && y >= MIN_YEAR && y <= maxYear))].sort((a, b) => a - b);
}

export interface CountryYears {
  /** Every year the user was in the country, ascending. */
  all: number[];
  /** Years that come from dates and trips (cannot be removed in the year picker, only through the trip or date). */
  derived: number[];
  /** Years the user named by hand on the country. */
  manual: number[];
}

/**
 * Years per visited country: years named by hand, years of visit dates (city or country) and the start years of trips
 * that confirmed a visit. A trip in the future never adds a year.
 */
export function yearsByCountry(visits: readonly Visit[], trips: readonly Trip[], today: string): Map<string, CountryYears> {
  const maxYear = Number(today.slice(0, 4));
  const tripYear = new Map<string, number>();
  for (const t of trips) {
    const y = t.startDate && t.startDate <= today ? yearOf(t.startDate) : null;
    if (y) tripYear.set(t.id, y);
  }
  const acc = new Map<string, { derived: Set<number>; manual: Set<number> }>();
  for (const v of visits) {
    const e = acc.get(v.countryId) ?? { derived: new Set<number>(), manual: new Set<number>() };
    acc.set(v.countryId, e);
    const d = v.date && v.date <= today ? yearOf(v.date) : null;
    if (d) e.derived.add(d);
    for (const id of v.tripIds) {
      const y = tripYear.get(id);
      if (y) e.derived.add(y);
    }
    for (const y of v.years ?? []) e.manual.add(y);
  }
  const out = new Map<string, CountryYears>();
  for (const [id, e] of acc) {
    const derived = normalizeYears([...e.derived], maxYear);
    const manual = normalizeYears([...e.manual], maxYear);
    out.set(id, { derived, manual, all: normalizeYears([...derived, ...manual], maxYear) });
  }
  return out;
}

/** «Посещена в 2022, 2023»: the label of a visited country; plain «Посещена» without years. */
export function visitedLabel(years: readonly number[], feminine: boolean): string {
  const base = feminine ? 'Посещена' : 'Посещён';
  return years.length ? `${base} в ${years.join(', ')}` : base;
}

export interface YearCount {
  year: number;
  countries: number;
  ids: string[];
}

/** Countries per year, newest year first. A country visited in two years counts in both. */
export function countriesPerYear(years: ReadonlyMap<string, CountryYears>, counted?: ReadonlySet<string>): YearCount[] {
  const by = new Map<number, string[]>();
  for (const [id, y] of years) {
    if (counted && !counted.has(id)) continue;
    for (const year of y.all) by.set(year, [...(by.get(year) ?? []), id]);
  }
  return [...by.entries()].map(([year, ids]) => ({ year, countries: ids.length, ids })).sort((a, b) => b.year - a.year);
}

/** The year with the most countries; on a tie the later year wins. */
export function bestYear(list: readonly YearCount[]): YearCount | null {
  let best: YearCount | null = null;
  for (const y of list) if (!best || y.countries > best.countries || (y.countries === best.countries && y.year > best.year)) best = y;
  return best;
}
