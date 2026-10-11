import type { City } from './model';
import type { FoundCountry, FoundTrip } from './photoPlaces';

/** What the user changed on the review screen. Keys: `c:<country>`, `y:<found city id>`, `m:<added city id>`, `t:<trip index>`. */
export interface Edits {
  off: ReadonlySet<string>;
  /** Hand-entered dates (null = "без даты"). */
  dates: ReadonlyMap<string, string | null>;
  /** A found city the user replaced with another one. */
  replace: ReadonlyMap<string, Place>;
  /** Cities the user added by hand, per country. */
  extra: ReadonlyMap<string, readonly Place[]>;
}
export type Place = Omit<City, 'createdAt' | 'updatedAt'>;

export const NO_EDITS: Edits = { off: new Set(), dates: new Map(), replace: new Map(), extra: new Map() };

export interface RowCity {
  key: string;
  city: Place;
  date: string | null;
  /** The date taken from the photos (null for an added city). */
  photoDate: string | null;
  on: boolean;
  photos: number;
  manual: boolean;
  replaced: boolean;
}
export interface RowCountry {
  key: string;
  countryId: string;
  date: string | null;
  photoDate: string | null;
  on: boolean;
  photos: number;
  cities: RowCity[];
}

const pick = (e: Edits, key: string, auto: string | null) => (e.dates.has(key) ? (e.dates.get(key) ?? null) : auto);

/** The review list: what the photos found, with the user's changes applied. */
export function reviewRows(found: readonly FoundCountry[], places: ReadonlyMap<string, Place>, e: Edits): RowCountry[] {
  return found.map((c) => {
    const key = `c:${c.countryId}`;
    const cities: RowCity[] = [];
    for (const y of c.cities) {
      const base = places.get(y.cityId);
      if (!base) continue;
      const k = `y:${y.cityId}`;
      const r = e.replace.get(y.cityId);
      cities.push({ key: k, city: r ?? base, date: pick(e, k, y.first), photoDate: y.first, on: !e.off.has(k), photos: y.photos, manual: false, replaced: !!r });
    }
    for (const m of e.extra.get(c.countryId) ?? []) {
      const k = `m:${m.id}`;
      cities.push({ key: k, city: m, date: pick(e, k, null), photoDate: null, on: !e.off.has(k), photos: 0, manual: true, replaced: false });
    }
    return { key, countryId: c.countryId, date: pick(e, key, c.first), photoDate: c.first, on: !e.off.has(key), photos: c.photos, cities };
  });
}

/** Visits to write. Two found cities replaced by the same city become one visit with the earlier date. */
export function placesToSave(rows: readonly RowCountry[]): Array<{ city: Place | null; countryId: string; date: string | null }> {
  const out: Array<{ city: Place | null; countryId: string; date: string | null }> = [];
  const byCity = new Map<string, { city: Place | null; countryId: string; date: string | null }>();
  for (const c of rows) {
    if (!c.on) continue;
    out.push({ city: null, countryId: c.countryId, date: c.date });
    for (const y of c.cities) {
      if (!y.on) continue;
      const prev = byCity.get(y.city.id);
      if (prev) {
        if (y.date && (!prev.date || y.date < prev.date)) prev.date = y.date;
        continue;
      }
      const v = { city: y.city, countryId: y.city.countryId, date: y.date };
      byCity.set(y.city.id, v);
      out.push(v);
    }
  }
  return out;
}

/** Trips to create, with replaced cities swapped in the route. */
export function tripsToSave(
  trips: readonly FoundTrip[],
  places: ReadonlyMap<string, Place>,
  e: Edits,
  title: (t: FoundTrip) => string,
): Array<{ title: string; start: string; end: string; countryIds: string[]; stops: Array<{ city: Place; startDate: string | null; endDate: string | null }> }> {
  return trips.flatMap((t, i) => {
    if (e.off.has(`t:${i}`)) return [];
    const stops: Array<{ city: Place; startDate: string | null; endDate: string | null }> = [];
    for (const s of t.stops) {
      const city = e.replace.get(s.cityId) ?? places.get(s.cityId);
      if (!city) continue;
      const same = stops.find((x) => x.city.id === city.id);
      if (same) same.endDate = s.end;
      else stops.push({ city, startDate: s.start, endDate: s.end });
    }
    return [{ title: title(t), start: t.start, end: t.end, countryIds: t.countryIds, stops }];
  });
}
