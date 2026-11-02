import { distanceKm } from './achievements';
import type { Resort, Spot } from './hobby';
import type { City } from './model';

/** One line of «Факты» (also offered on the share card). */
export interface FactRow {
  id: string;
  icon: string;
  text: string;
  /** Shorter text for the share card. */
  short?: string;
}

const num = (n: number) => Math.round(n).toLocaleString('ru-RU');
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};
const located = (c: City | null | undefined): c is City & { lat: number; lon: number } => !!c && c.lat !== null && c.lon !== null;
const lat = (v: number) => `${Math.abs(v).toFixed(1)}° ${v < 0 ? 'ю. ш.' : 'с. ш.'}`;

function farthest<T extends { lat: number; lon: number }>(items: readonly T[], home: City | null | undefined): { item: T; km: number } | null {
  if (!located(home)) return null;
  let best: { item: T; km: number } | null = null;
  for (const it of items) {
    const km = distanceKm(home, it);
    if (!best || km > best.km) best = { item: it, km };
  }
  return best;
}

/** Facts of the Rider hobby from the visited resorts (one per place, found in the catalog). */
export function riderFacts(resorts: readonly Resort[], countryName: (id: string) => string, home?: City | null): FactRow[] {
  if (!resorts.length) return [];
  const name = (r: Resort) => r.nameRu || r.name;
  const rows: FactRow[] = [];
  const countries = new Set(resorts.map((r) => r.countryId));
  rows.push({
    id: 'r-count', icon: '🏔️',
    text: `${num(resorts.length)} ${plural(resorts.length, 'курорт', 'курорта', 'курортов')} в ${num(countries.size)} ${plural(countries.size, 'стране', 'странах', 'странах')}`,
  });
  const top = [...resorts].filter((r) => r.elevMax !== null).sort((a, b) => (b.elevMax ?? 0) - (a.elevMax ?? 0))[0];
  if (top?.elevMax) rows.push({ id: 'r-high', icon: '⛰️', text: `Выше всего — ${name(top)}, до ${num(top.elevMax)} м`, short: `Выше всего — ${name(top)}, ${num(top.elevMax)} м` });
  const big = [...resorts].filter((r) => r.pisteKm !== null).sort((a, b) => (b.pisteKm ?? 0) - (a.pisteKm ?? 0))[0];
  if (big?.pisteKm) rows.push({ id: 'r-km', icon: '🛣️', text: `Больше всего трасс — ${name(big)}, ${num(big.pisteKm)} км` });
  const north = [...resorts].sort((a, b) => b.lat - a.lat)[0];
  if (north && resorts.length > 1) rows.push({ id: 'r-north', icon: '🧭', text: `Самый северный курорт — ${name(north)} (${lat(north.lat)})` });
  const far = farthest(resorts, home);
  if (far) rows.push({ id: 'r-far', icon: '📍', text: `Дальше всего от дома — ${name(far.item)}, ${num(far.km)} км` });
  const byCountry = new Map<string, number>();
  for (const r of resorts) byCountry.set(r.countryId, (byCountry.get(r.countryId) ?? 0) + 1);
  const [bc, bn] = [...byCountry.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (bc && bn && bn > 1 && countries.size > 1) rows.push({ id: 'r-country', icon: '❤️', text: `Больше всего курортов — ${countryName(bc)}: ${bn}` });
  return rows;
}

/** Facts of the Surf hobby from the visited spots (found in the catalog) and the number of favourites. */
export function surfFacts(spots: readonly Spot[], favourites: number, countryName: (id: string) => string, home?: City | null): FactRow[] {
  const rows: FactRow[] = [];
  if (spots.length) {
    const countries = new Set(spots.map((s) => s.countryId));
    rows.push({
      id: 's-count', icon: '🌊',
      text: `${num(spots.length)} ${plural(spots.length, 'спот', 'спота', 'спотов')} в ${num(countries.size)} ${plural(countries.size, 'стране', 'странах', 'странах')}`,
    });
    const continents = [...new Set(spots.map((s) => s.continent).filter((c): c is string => !!c))];
    if (continents.length) rows.push({ id: 's-cont', icon: '🌍', text: `Континенты: ${continents.join(', ')}` });
    const byGroup = new Map<string, number>();
    for (const s of spots) if (s.group) byGroup.set(s.group, (byGroup.get(s.group) ?? 0) + 1);
    const [g, gn] = [...byGroup.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (g && gn && gn > 1) rows.push({ id: 's-group', icon: '🏝️', text: `Больше всего спотов — ${g}: ${gn}` });
    const south = [...spots].sort((a, b) => a.lat - b.lat)[0];
    if (south && spots.length > 1) rows.push({ id: 's-south', icon: '🐧', text: `Самый южный спот — ${south.name} (${lat(south.lat)})` });
    const far = farthest(spots, home);
    if (far) rows.push({ id: 's-far', icon: '📍', text: `Дальше всего от дома — ${far.item.name}, ${num(far.km)} км` });
  }
  if (favourites > 0) rows.push({ id: 's-fav', icon: '❤️', text: `В избранном — ${num(favourites)} ${plural(favourites, 'спот', 'спота', 'спотов')}` });
  return rows;
}
