import type { CityInput, Undo } from '../data/store';
import type { City, Trip, TripStop } from '../domain/model';
import { countryName } from '../geo/reference';
import { store } from './world';

type Toast = (text: string, action?: { label: string; run: () => void }) => void;

const withUndo = (toast: Toast, text: string, undo: Undo) => {
  if (undo.visits.length + undo.plans.length === 0) return;
  toast(text, { label: 'Вернуть', run: () => void store.undo(undo) });
};

export async function markCity(toast: Toast, city: CityInput, status: 'visited' | 'planned', date: string | null = null) {
  try {
    await store.markCity(city, status, date);
    toast(status === 'visited' ? `${city.name}: посещён` : `${city.name}: запланирован`);
  } catch (e) {
    toast(`Не удалось сохранить: ${e instanceof Error ? e.message : e}`);
  }
}

export async function unmarkCity(toast: Toast, city: City | CityInput, what: 'visited' | 'planned' | 'all') {
  const undo = await store.unmarkCity(city.id, what);
  withUndo(toast, `${city.name}: отметка снята`, undo);
}

export async function markCountry(toast: Toast, countryId: string, status: 'visited' | 'planned') {
  await store.markCountry(countryId, status);
  toast(status === 'visited' ? `${countryName(countryId)}: посещена` : `${countryName(countryId)}: запланирована`);
}

export async function unmarkCountry(toast: Toast, countryId: string, what: 'visited' | 'planned', withCities: boolean) {
  const undo = await store.unmarkCountry(countryId, what, withCities);
  withUndo(toast, `${countryName(countryId)}: отметка снята`, undo);
}

/** Trips whose route passes through a city, or that include a country. Newest first. */
export const tripsForCity = (cityId: string, trips: Trip[], stops: TripStop[]): Trip[] => {
  const ids = new Set(stops.filter((s) => s.cityId === cityId).map((s) => s.tripId));
  return trips.filter((t) => ids.has(t.id)).sort(byStartDesc);
};
export const tripsForCountry = (countryId: string, trips: Trip[]): Trip[] => trips.filter((t) => t.countryIds.includes(countryId)).sort(byStartDesc);

const byStartDesc = (a: Trip, b: Trip) => (b.startDate ?? '9999').localeCompare(a.startDate ?? '9999');
