import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { WorldDb } from '../data/db';
import { WorldStore } from '../data/store';
import type { City, Methodology, PlannedMark, Trip, TripStop, Visit } from '../domain/model';
import { deriveWorld, type WorldState } from '../domain/world';
import { type Currency, DEFAULT_RATES, DEFAULT_RATES_DATE, type Rates } from '../domain/money';

export const db = new WorldDb();
export const store = new WorldStore(db);

export interface Settings {
  methodology: Methodology;
  /** Lighter rendering for weak phones: no globe auto-rotation, no atmosphere, plain map. */
  lite: boolean;
  /** Detailed basemap (roads, labels) from OpenFreeMap when online. */
  detail: boolean;
  /** Grammatical gender for texts addressed to the user: "Был здесь" / "Была здесь". */
  gender: 'male' | 'female';
  /** Currency for new prices and for trip totals. */
  currency: Currency;
  /** Rubles per unit of each currency (RUB is always 1). */
  rates: Rates;
  ratesDate: string | null;
  ratesSource: 'default' | 'manual' | 'cbr';
  /** Trips screen: big swipeable cards or a compact list. */
  tripsView: 'carousel' | 'list';
  /** Profile */
  name: string;
  homeCityId: string | null;
  passport: 'RU' | 'other';
  avatarId: string | null;
  /** Social card: show the traveller status line. */
  shareStatus: boolean;
  /** Home country for the «Моя страна» tracker (falls back to the home city's country). */
  homeCountryId: string | null;
  /** Short globe-and-planes animation on every launch. */
  splash: boolean;
}
const DEFAULTS: Settings = {
  methodology: 'm195',
  lite: false,
  detail: true,
  gender: 'male',
  currency: 'RUB',
  rates: DEFAULT_RATES,
  ratesDate: DEFAULT_RATES_DATE,
  ratesSource: 'default',
  tripsView: 'carousel',
  name: '',
  homeCityId: null,
  passport: 'RU',
  avatarId: null,
  shareStatus: true,
  homeCountryId: null,
  splash: true,
};

/** Texts that depend on the user's gender. */
export const been = (g: Settings['gender']) => ({
  here: g === 'female' ? 'Была здесь' : 'Был здесь',
  short: g === 'female' ? 'Была' : 'Был',
  on: g === 'female' ? 'Была' : 'Был',
});

export interface WorldData {
  ready: boolean;
  error: string | null;
  visits: Visit[];
  plans: PlannedMark[];
  trips: Trip[];
  stops: TripStop[];
  cities: Map<string, City>;
  world: WorldState;
  settings: Settings;
}

const EMPTY = deriveWorld([], [], []);
const Ctx = createContext<WorldData | null>(null);

export function useWorld(): WorldData {
  const v = useContext(Ctx);
  if (!v) throw new Error('WorldProvider missing');
  return v;
}

/** Live view of the user's data: every write anywhere re-renders the screens that read it. */
export function WorldProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    db.open().catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    // Ask the browser not to evict our data under storage pressure (no prompt on most browsers).
    navigator.storage?.persist?.().catch(() => undefined);
  }, []);
  const visits = useLiveQuery(() => db.visits.toArray(), []);
  const plans = useLiveQuery(() => db.plans.toArray(), []);
  const trips = useLiveQuery(() => db.trips.toArray(), []);
  const stops = useLiveQuery(() => db.stops.toArray(), []);
  const cityRows = useLiveQuery(() => db.cities.toArray(), []);
  const meta = useLiveQuery(() => db.meta.toArray(), []);

  const value = useMemo<WorldData>(() => {
    const ready = !!(visits && plans && trips && stops && cityRows && meta);
    const settings: Settings = { ...DEFAULTS };
    for (const m of meta ?? []) if (m.key in DEFAULTS) (settings as unknown as Record<string, unknown>)[m.key] = m.value;
    return {
      ready,
      error,
      visits: visits ?? [],
      plans: plans ?? [],
      trips: trips ?? [],
      stops: stops ?? [],
      cities: new Map((cityRows ?? []).map((c) => [c.id, c])),
      world: ready ? deriveWorld(visits ?? [], plans ?? [], stops ?? []) : EMPTY,
      settings,
    };
  }, [visits, plans, trips, stops, cityRows, meta, error]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> => store.setSetting(key, value);

/** Today's local date, refreshed when the app comes back to the foreground (a trip can start overnight). */
export function useToday(): string {
  const calc = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const [today, setToday] = useState(calc);
  useEffect(() => {
    const on = () => setToday(calc());
    document.addEventListener('visibilitychange', on);
    const t = window.setInterval(on, 60_000);
    return () => {
      document.removeEventListener('visibilitychange', on);
      window.clearInterval(t);
    };
  }, []);
  return today;
}
