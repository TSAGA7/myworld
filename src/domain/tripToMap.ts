import type { PlannedMark, Trip, TripStop, Visit } from './model';
import { visitKey } from './model';

/**
 * Moving a trip onto the shared map. Both operations are planned first (a preview the user confirms) and then
 * turned into a minimal list of creates/updates. Running an operation twice yields an empty list the second time:
 * there is one plan and one visit record per place, a repeat only links the trip to the existing record.
 */

export type PlaceTarget = { key: string; cityId: string | null; countryId: string; stopId: string | null };

/** Unique places of a trip: its stops in route order, then trip countries that have no stop. */
export function tripPlaces(trip: Trip, stops: readonly TripStop[]): PlaceTarget[] {
  const out: PlaceTarget[] = [];
  const seen = new Set<string>();
  const ordered = [...stops].filter((s) => s.tripId === trip.id).sort((a, b) => a.order - b.order);
  for (const s of ordered) {
    const key = visitKey(s.cityId, s.countryId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, cityId: s.cityId, countryId: s.countryId, stopId: s.id });
  }
  const withCities = new Set(ordered.map((s) => s.countryId));
  for (const c of trip.countryIds) {
    const key = visitKey(null, c);
    if (withCities.has(c) || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, cityId: null, countryId: c, stopId: null });
  }
  return out;
}

// ---------- "Добавить города на карту"

export type AddState = 'new' | 'planned' | 'visited';
export interface AddPreviewItem extends PlaceTarget {
  state: AddState;
  /** Already linked to this very trip: nothing will change for it. */
  linked: boolean;
}
export interface AddPreview {
  items: AddPreviewItem[];
  added: number;
  already: number;
}

export function previewAddToMap(trip: Trip, stops: readonly TripStop[], plans: readonly PlannedMark[], visits: readonly Visit[]): AddPreview {
  const planByKey = new Map(plans.map((p) => [p.key, p]));
  const visitByKey = new Map(visits.map((v) => [v.key, v]));
  const visitedCountries = new Set(visits.map((v) => v.countryId));
  const items = tripPlaces(trip, stops).map<AddPreviewItem>((t) => {
    const plan = planByKey.get(t.key);
    const visited = visitByKey.has(t.key) || (t.cityId === null && visitedCountries.has(t.countryId));
    const state: AddState = visited ? 'visited' : plan ? 'planned' : 'new';
    return { ...t, state, linked: !!plan?.tripIds.includes(trip.id) };
  });
  const added = items.filter((i) => i.state === 'new').length;
  return { items, added, already: items.length - added };
}

export interface Ops<T> {
  creates: T[];
  updates: T[];
}

/** Plans to write. Visited places get no plan: they are already on the map as visited. */
export function buildAddToMap(trip: Trip, preview: AddPreview, plans: readonly PlannedMark[], now: string, newId: () => string): Ops<PlannedMark> {
  const planByKey = new Map(plans.map((p) => [p.key, p]));
  const ops: Ops<PlannedMark> = { creates: [], updates: [] };
  for (const item of preview.items) {
    if (item.state === 'visited') continue;
    const existing = planByKey.get(item.key);
    if (existing) {
      if (!existing.tripIds.includes(trip.id)) ops.updates.push({ ...existing, tripIds: [...existing.tripIds, trip.id], updatedAt: now });
      continue;
    }
    ops.creates.push({
      id: newId(),
      key: item.key,
      cityId: item.cityId,
      countryId: item.countryId,
      tripIds: [trip.id],
      manual: false,
      createdAt: now,
      updatedAt: now,
    });
  }
  return ops;
}

// ---------- "Отметить города посещёнными"

export interface VisitPreviewItem extends PlaceTarget {
  /** Date from the stop, else from the trip start. */
  proposedDate: string | null;
  existing: Visit | null;
  /** Existing visit has a different date: the user decides whether to replace it. */
  dateConflict: boolean;
  /** Visit already confirmed by this trip: selecting it changes nothing. */
  linked: boolean;
}

export function previewMarkVisited(trip: Trip, stops: readonly TripStop[], visits: readonly Visit[]): VisitPreviewItem[] {
  const visitByKey = new Map(visits.map((v) => [v.key, v]));
  const stopById = new Map(stops.map((s) => [s.id, s]));
  return tripPlaces(trip, stops).map((t) => {
    const stop = t.stopId ? stopById.get(t.stopId) : undefined;
    const proposedDate = stop?.startDate ?? trip.startDate ?? null;
    const existing = visitByKey.get(t.key) ?? null;
    return {
      ...t,
      proposedDate,
      existing,
      dateConflict: !!existing?.date && !!proposedDate && existing.date !== proposedDate,
      linked: !!existing?.tripIds.includes(trip.id),
    };
  });
}

/**
 * @param selected keys the user confirmed
 * @param replaceDate keys whose existing date should be replaced by the trip date
 */
export function buildMarkVisited(
  trip: Trip,
  items: readonly VisitPreviewItem[],
  selected: ReadonlySet<string>,
  replaceDate: ReadonlySet<string>,
  now: string,
  newId: () => string,
): Ops<Visit> {
  const ops: Ops<Visit> = { creates: [], updates: [] };
  for (const item of items) {
    if (!selected.has(item.key)) continue;
    const v = item.existing;
    if (!v) {
      ops.creates.push({
        id: newId(),
        key: item.key,
        cityId: item.cityId,
        countryId: item.countryId,
        date: item.proposedDate,
        tripIds: [trip.id],
        manual: false,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }
    const tripIds = v.tripIds.includes(trip.id) ? v.tripIds : [...v.tripIds, trip.id];
    let date = v.date;
    if (!date && item.proposedDate) date = item.proposedDate;
    else if (item.dateConflict && replaceDate.has(item.key)) date = item.proposedDate;
    if (tripIds !== v.tripIds || date !== v.date) ops.updates.push({ ...v, tripIds, date, updatedAt: now });
  }
  return ops;
}
