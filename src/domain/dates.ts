/** Calendar helpers on LocalDate strings (YYYY-MM-DD). No time zones are involved. */

export type TripStatus = 'upcoming' | 'ongoing' | 'completed';

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Today's date in the device's local calendar. */
export const todayLocal = (now: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};

const parts = (d: string): [number, number, number] => {
  const [y, m, day] = d.split('-').map(Number);
  return [y ?? 0, m ?? 1, day ?? 1];
};

/** Whole days from a to b (b - a). Uses UTC arithmetic on calendar dates, so DST never adds or removes a day. */
export const daysBetween = (a: string, b: string): number => {
  const [y1, m1, d1] = parts(a);
  const [y2, m2, d2] = parts(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
};

export const tripStatus = (start: string | null, end: string | null, today: string): TripStatus => {
  const last = end ?? start;
  if (!start && !end) return 'upcoming';
  if (last && last < today) return 'completed';
  if (start && start > today) return 'upcoming';
  return 'ongoing';
};

export const STATUS_LABEL: Record<TripStatus, string> = { upcoming: 'Предстоит', ongoing: 'В процессе', completed: 'Завершено' };

export const formatDate = (d: string | null, withYear = true): string => {
  if (!d) return '';
  const [y, m, day] = parts(d);
  return withYear ? `${day} ${MONTHS_GEN[m - 1]} ${y}` : `${day} ${MONTHS_GEN[m - 1]}`;
};

/** "10–20 сент 2026", "28 авг – 3 сент 2026", "30 дек 2026 – 5 янв 2027". */
export const formatRange = (start: string | null, end: string | null): string => {
  if (!start && !end) return 'Даты не выбраны';
  if (!start || !end || start === end) {
    const d = (start ?? end) as string;
    const [y, m, day] = parts(d);
    return `${day} ${MONTHS_SHORT[m - 1]} ${y}`;
  }
  const [y1, m1, d1] = parts(start);
  const [y2, m2, d2] = parts(end);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS_SHORT[m2 - 1]} ${y2}`;
  if (y1 === y2) return `${d1} ${MONTHS_SHORT[m1 - 1]} – ${d2} ${MONTHS_SHORT[m2 - 1]} ${y2}`;
  return `${d1} ${MONTHS_SHORT[m1 - 1]} ${y1} – ${d2} ${MONTHS_SHORT[m2 - 1]} ${y2}`;
};

/** Number of nights, or null when the range is incomplete. */
export const nights = (start: string | null, end: string | null): number | null =>
  start && end ? Math.max(0, daysBetween(start, end)) : null;

export const plural = (n: number, one: string, few: string, many: string): string => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

export const countLabel = (n: number, one: string, few: string, many: string): string => `${n} ${plural(n, one, few, many)}`;
