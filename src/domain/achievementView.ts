import type { Achievement } from './achievements';
import type { RiderAchievement, RiderPlaceState } from './riderAchievements';

/** One shape for travel and rider achievements on screen. */
export interface AchView {
  id: string;
  icon: string;
  title: string;
  why: string;
  tile: string;
  value: number;
  target: number;
  done: boolean;
  places?: RiderPlaceState[];
  details?: string[];
  /** Only achievements with a short «за что» open a window; plain counters (100 cities) do not. */
  opens: boolean;
  rider: boolean;
  /** Steps of one ladder (5 → 10 → 25 countries): collapsed, only the lowest step not got yet is shown. */
  ladder?: string;
}

const LADDERS: Record<string, string> = {
  c5: 'countries', c10: 'countries', c25: 'countries', c50: 'countries', c100: 'countries',
  city10: 'cities', city50: 'cities', city100: 'cities',
  cont3: 'continents', cont6: 'continents',
  year5: 'year', year10: 'year',
  'rider-5': 'resorts', 'rider-15': 'resorts', 'rider-30': 'resorts',
  'surf-1': 'spots', 'surf-5': 'spots', 'surf-15': 'spots', 'surf-30': 'spots',
};

export const fromTravel = (a: Achievement): AchView => ({
  id: a.id, icon: a.icon, title: a.title, why: a.hint, tile: a.hint, value: a.value, target: a.target, done: a.done,
  ...(a.details ? { details: a.details } : {}), opens: a.details !== undefined, rider: false,
  ...(LADDERS[a.id] ? { ladder: LADDERS[a.id] } : {}),
});
/** Rider and surf achievements (same shape). */
export const fromHobby = (a: RiderAchievement): AchView => ({ ...a, opens: true, rider: true, ...(LADDERS[a.id] ? { ladder: LADDERS[a.id] } : {}) });

/**
 * What the collapsed grid shows: everything got, and what is started — for a ladder only its next step
 * (5 of 10 countries is shown, «100 countries» waits until «50» is got).
 */
export function collapsedView(list: readonly AchView[]): AchView[] {
  const nextStep = new Set<string>();
  const out: AchView[] = [];
  for (const a of list) {
    if (a.done) {
      out.push(a);
      continue;
    }
    if (!started(a)) continue;
    if (a.ladder) {
      if (nextStep.has(a.ladder)) continue;
      nextStep.add(a.ladder);
    }
    out.push(a);
  }
  return out;
}

/** Started = some progress but not done yet (one resort of three, 7 of 10 countries). */
export const started = (a: AchView) => !a.done && a.value > 0;

