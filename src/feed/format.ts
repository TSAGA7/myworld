import { plural } from '../domain/dates';
import type { Deal, NewsItem, Tag } from './schema';

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** 13900 → "13 900 ₽" with non-breaking spaces (never wraps). */
export const rub = (n: number): string => `${String(Math.round(n)).replace(/\B(?=(\d{3})+$)/g, '\u00a0')}\u00a0₽`;

/** "только что", "12 мин назад", "3 ч назад", "вчера", "29 окт" */
export function ago(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - Date.parse(iso)) / 60e3);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  if (h < 48) return 'вчера';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Calendar day of a "YYYY-MM-DD…" string, as written there (departure local time). */
export const dayMonth = (iso: string): string => {
  const m = Number(iso.slice(5, 7)) - 1;
  return `${Number(iso.slice(8, 10))} ${MONTHS[m] ?? ''}`;
};
export const dayMonthFull = (date: string): string => `${Number(date.slice(8, 10))} ${MONTHS_FULL[Number(date.slice(5, 7)) - 1] ?? ''}`;

export const transfersLabel = (n: number): string => (n === 0 ? 'прямой' : `${n} ${plural(n, 'пересадка', 'пересадки', 'пересадок')}`);

export const durationLabel = (min: number): string => {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} ч${m ? ` ${m} мин` : ''}` : `${m} мин`;
};

const FROM: Record<string, string> = { Москва: 'Москвы', 'Санкт-Петербург': 'Петербурга', Казань: 'Казани', Екатеринбург: 'Екатеринбурга', Новосибирск: 'Новосибирска', Краснодар: 'Краснодара', Сочи: 'Сочи' };
/** "из Москвы" */
export const fromCity = (name: string): string => `из ${FROM[name] ?? name}`;

export type NewsFilter = 'all' | Tag;
export const filterNews = (items: readonly NewsItem[], f: NewsFilter): NewsItem[] => (f === 'all' ? [...items] : items.filter((i) => i.tags.includes(f)));

/** Deals from one departure city; the newest finds first among equal discounts. */
export const dealsFrom = (deals: readonly Deal[], origin: string | null): Deal[] =>
  deals.filter((d) => !origin || d.origin === origin).sort((a, b) => b.discount - a.discount || b.foundAt.localeCompare(a.foundAt));

/** Departure city for the home city name, if it is one of the scanned ones. */
export function originForHome(origins: ReadonlyArray<{ code: string; name: string }>, homeName: string | undefined): string | null {
  if (!homeName) return null;
  const h = homeName.toLowerCase().replace(/ё/g, 'е');
  return origins.find((o) => o.name.toLowerCase().replace(/ё/g, 'е') === h || (h === 'петербург' && o.code === 'LED'))?.code ?? null;
}

/** Compare a live price with the one in the list. */
export function liveVerdict(listed: number, live: number | null): { kind: 'same' | 'cheaper' | 'dearer' | 'gone'; text: string } {
  if (live === null) return { kind: 'gone', text: 'На этот день билетов по такой цене уже нет' };
  const diff = live - listed;
  if (Math.abs(diff) <= Math.max(100, listed * 0.03)) return { kind: 'same', text: `Цена держится: ${rub(live)}` };
  if (diff < 0) return { kind: 'cheaper', text: `Стало ещё дешевле: ${rub(live)}` };
  return { kind: 'dearer', text: `Подорожало до ${rub(live)} (+${Math.round((diff / listed) * 100)}%)` };
}

/** Greeting by the local hour: утро 5–11, день 12–16, вечер 17–22, ночь. */
export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Доброе утро';
  if (hour >= 12 && hour < 17) return 'Добрый день';
  if (hour >= 17 && hour < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}
