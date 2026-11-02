import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useWorld } from '../../app/world';
import type { RoutesFile } from '../../feed/deals';
import { type AirportCoords, cityPoint, type Point, type TripFocus } from '../../feed/destinations';
import { loadAirports } from '../../geo/airports';
import { useCatalog } from '../../geo/hobbyCatalog';

// ---------- «Выгодные забросы»: the trip the tickets are picked for (set by the trip page / the new-trip form)

let focus: TripFocus | null = null;
const listeners = new Set<() => void>();
export function setDealsFocus(f: TripFocus | null): void {
  focus = f;
  listeners.forEach((l) => l());
}
export function useDealsFocus(): TripFocus | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => focus,
  );
}

/** Airports (code → position, country), loaded once. */
export function useAirportCoords(): AirportCoords {
  const [map, setMap] = useState<AirportCoords>(new Map());
  useEffect(() => {
    let alive = true;
    loadAirports()
      .then((all) => alive && setMap(new Map([...all].map(([k, a]) => [k, { lat: a.lat, lon: a.lon, country: a.countryId }]))))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return map;
}

/** Resorts / spots of the hobbies that are on (positions only). */
export function useHobbyPoints(): { resorts: Point[]; spots: Point[] } {
  const { settings } = useWorld();
  const r = useCatalog('resorts', !!settings.riderType);
  const s = useCatalog('spots', settings.surf);
  return useMemo(
    () => ({
      // Real ski areas only: 25+ km of pistes or 600+ m of vertical (not a local hill next to a city airport).
      resorts: settings.riderType ? r.items.filter((x) => x.active && ((x.pisteKm ?? 0) >= 25 || (x.elevMax ?? 0) - (x.elevMin ?? 0) >= 600)).map((x) => ({ lat: x.lat, lon: x.lon })) : [],
      spots: settings.surf ? s.items.filter((x) => x.active && !x.area).map((x) => ({ lat: x.lat, lon: x.lon })) : [],
    }),
    [settings.riderType, settings.surf, r, s],
  );
}

export const pointOf = (routes: RoutesFile | null, airports: AirportCoords) => (code: string) => cityPoint(code, routes, airports);

/** The trip as the tickets screen needs it: dates, countries, cities with positions. */
export function tripFocus(
  title: string,
  start: string,
  end: string,
  countryIds: readonly string[],
  cities: ReadonlyArray<{ name: string; countryId: string; lat: number | null; lon: number | null }>,
): TripFocus {
  const located = cities.filter((c): c is { name: string; countryId: string; lat: number; lon: number } => c.lat !== null && c.lon !== null);
  return {
    title: title.trim() || 'Новая поездка',
    start,
    end,
    countries: [...new Set([...countryIds, ...cities.map((c) => c.countryId)])],
    cities: located.map((c) => ({ name: c.name, countryId: c.countryId, lat: c.lat, lon: c.lon })),
  };
}

/** «Выгодные забросы»: opens «Лента → Билеты» with the picks for this trip on top. */
export function openTripDeals(f: TripFocus, go: (to: string) => void): void {
  setDealsFocus(f);
  go('feed/deals');
}
