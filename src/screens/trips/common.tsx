import { useMemo } from 'react';
import { useToday, useWorld } from '../../app/world';
import { type TripStatus, tripCountdown, tripStatus } from '../../domain/dates';
import type { City, Trip, TripStop } from '../../domain/model';
import type { IconName } from '../../ui/Icon';

export interface RouteStop {
  stop: TripStop;
  city: City | undefined;
}

/** Route of a trip in visiting order, each stop joined with its city snapshot. */
export function useRoute(tripId: string | null): RouteStop[] {
  const { stops, cities } = useWorld();
  return useMemo(
    () =>
      tripId
        ? stops
            .filter((s) => s.tripId === tripId)
            .sort((a, b) => a.order - b.order)
            .map((stop) => ({ stop, city: cities.get(stop.cityId) }))
        : [],
    [stops, cities, tripId],
  );
}

/** Trip status with the countdown: «Через 53 дня», «Завтра», «День 2 из 5». Recounts at midnight (useToday). */
export function TripStatusPill({ trip }: { trip: Pick<Trip, 'startDate' | 'endDate'> }) {
  const today = useToday();
  const status: TripStatus = tripStatus(trip.startDate, trip.endDate, today);
  const cls = status === 'ongoing' ? 'lime' : status === 'upcoming' ? 'dark' : '';
  return <span className={`pill num ${cls}`}>{tripCountdown(trip.startDate, trip.endDate, today)}</span>;
}

export const MODE_LABEL = { flight: 'Самолёт', train: 'Поезд', bus: 'Автобус', ferry: 'Паром', car: 'Аренда авто', other: 'Другое' } as const;
export const MODE_ICON: Record<keyof typeof MODE_LABEL, IconName> = { flight: 'plane', train: 'train', bus: 'bus', ferry: 'ferry', car: 'car', other: 'ticket' };
export const STAY_LABEL = { hotel: 'Отель', apartment: 'Апартаменты', hostel: 'Хостел', other: 'Другое' } as const;
export const BOOKING_LABEL = { tour: 'Экскурсия', event: 'Мероприятие', tickets: 'Входные билеты', restaurant: 'Ресторан', rental: 'Аренда', other: 'Другое' } as const;
export const NOTE_LABEL = { note: 'Заметка', link: 'Ссылка', address: 'Адрес', contact: 'Контакт' } as const;
export const NOTE_ICON: Record<keyof typeof NOTE_LABEL, IconName> = { note: 'note', link: 'link', address: 'home', contact: 'phone' };

/** Number input value → price or null. Accepts "1 250,50". */
export const parsePrice = (s: string): number | null => {
  const v = Number(s.replace(/\s/g, '').replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(v) || v < 0 ? null : v;
};

/** Safe external link: only http(s), so a stored "javascript:" never runs. */
export const safeUrl = (u: string): string | null => {
  const t = u.trim();
  if (!t) return null;
  const withProto = /^[a-z]+:/i.test(t) ? t : `https://${t}`;
  try {
    const url = new URL(withProto);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
};

export const sortTrips = (list: Trip[], status: (t: Trip) => TripStatus): Trip[] =>
  [...list].sort((a, b) => {
    const sa = status(a);
    const sb = status(b);
    const rank = { ongoing: 0, upcoming: 1, completed: 2 } as const;
    if (sa !== sb) return rank[sa] - rank[sb];
    // Upcoming: soonest first (no dates last). Completed: most recent first.
    if (sa === 'completed') return (b.startDate ?? '').localeCompare(a.startDate ?? '');
    return (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999');
  });
