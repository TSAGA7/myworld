import type { City } from './model';
import type { Resort } from './hobby';
import { distanceKm } from './achievements';
import { normalize } from './search';

/**
 * Achievements of the Rider hobby (skis / snowboard). One file for all of them — the list will grow.
 *
 * A place counts when the user has:
 *  - «Был здесь» on a resort of the place (catalog id, or the resort's name/alias near the place — ids can change), or
 *  - a visited city of the place (name near the place, or any city inside an area such as Hokkaido).
 * An achievement with several places («Кавказский движ») needs all of them.
 *
 * To add one: a new entry in RIDER_ACHIEVEMENTS. `icon` is an emoji, or `svg:<name>` for a picture from ui/AchIcon.tsx.
 */

export interface RiderPlace {
  /** How the place is called in the «за что» window. */
  label: string;
  /** Catalog ids (catalog/resorts.json on the `data` branch). */
  resorts?: string[];
  /** Names of the resort and its towns, any spelling the catalog or GeoNames uses. */
  names?: string[];
  country: string;
  /** Centre of the place: a name only counts this close to it (there are two Кировска in Russia). */
  near?: [number, number];
  km?: number;
  /** A whole area (an island, a peninsula): every resort and city inside counts. */
  area?: (lat: number, lon: number) => boolean;
}

export interface RiderAchievementDef {
  id: string;
  icon: string;
  title: string;
  /** Shown in the window: why it is given. */
  why: string;
  places: RiderPlace[];
}

const hokkaido = (lat: number, lon: number) => lat >= 41.6 || (lat >= 41.35 && lon < 140.5);
const kamchatka = (lat: number, lon: number) => lon >= 155 && lat >= 50.5 && lat <= 62.5;

export const RIDER_ACHIEVEMENTS: RiderAchievementDef[] = [
  {
    id: 'rider-north',
    icon: '🌌',
    title: 'Северный вайб',
    why: 'За катание в Кировске — Хибины, за полярным кругом.',
    places: [{ label: 'Кировск', resorts: ['skimap-1951'], names: ['Кировск', 'Kirovsk', 'Большой Вудъявр', 'Big Wood', 'Хибины'], country: 'RU', near: [67.61, 33.68], km: 25 }],
  },
  {
    id: 'rider-caucasus',
    icon: '🏔️',
    title: 'Кавказский движ',
    why: 'За все три классики Кавказа: Архыз, Эльбрус и Домбай.',
    places: [
      { label: 'Архыз', resorts: ['skimap-13636'], names: ['Архыз', 'Arkhyz', 'Arhyz', 'Романтик'], country: 'RU', near: [43.56, 41.2], km: 25 },
      { label: 'Эльбрус', resorts: ['osm-relation-6930862'], names: ['Эльбрус', 'Elbrus', 'Терскол', 'Terskol', 'Чегет', 'Cheget', 'Азау', 'Azau'], country: 'RU', near: [43.27, 42.5], km: 20 },
      { label: 'Домбай', resorts: ['skimap-1934'], names: ['Домбай', 'Dombay', 'Dombai'], country: 'RU', near: [43.29, 41.63], km: 15 },
    ],
  },
  {
    id: 'rider-luxury',
    icon: '💎',
    title: 'Russian Luxury',
    why: 'За все три курорта Красной Поляны: «Красная Поляна», «Роза Хутор» и «Газпром».',
    places: [
      { label: 'Красная Поляна', resorts: ['skimap-3093'], names: ['Красная Поляна', 'Krasnaya Polyana', 'Курорт Красная Поляна', 'Krasnaya Polyana Resort', 'Горки Город', 'Gorki Gorod'], country: 'RU', near: [43.67, 40.22], km: 8 },
      { label: 'Роза Хутор', resorts: ['skimap-2678'], names: ['Роза Хутор', 'Rosa Khutor', 'Roza Khutor'], country: 'RU', near: [43.65, 40.3], km: 8 },
      { label: 'Газпром', resorts: ['skimap-1947'], names: ['Газпром', 'Gazprom', 'Лаура', 'Laura', 'Альпика Сервис', 'Alpika Service'], country: 'RU', near: [43.69, 40.3], km: 8 },
    ],
  },
  {
    id: 'rider-sheregesh',
    icon: '🍻',
    title: 'Мощный après-ski',
    why: 'За Шерегеш — главную тусовку сибирских склонов.',
    places: [{ label: 'Шерегеш', resorts: ['skimap-1935'], names: ['Шерегеш', 'Sheregesh', 'Гора Зелёная'], country: 'RU', near: [52.94, 87.97], km: 20 }],
  },
  {
    id: 'rider-gudauri',
    icon: 'svg:khachapuri',
    title: 'Вааай мэ, маладэц!',
    why: 'За Гудаури. Хачапури по-аджарски заслужен.',
    places: [{ label: 'Гудаури', resorts: ['skimap-1187'], names: ['Гудаури', 'Gudauri'], country: 'GE', near: [42.48, 44.48], km: 15 }],
  },
  {
    id: 'rider-hokkaido',
    icon: '🍣',
    title: 'Унаги-маки, сякэ-маки',
    why: 'За Хоккайдо: Нисеко, Рускуцу, Фурано или любой другой курорт острова.',
    places: [{ label: 'Хоккайдо', country: 'JP', area: hokkaido }],
  },
  {
    id: 'rider-oldmoney',
    icon: '🎩',
    title: 'Old Money',
    why: 'За Куршевель, Санкт-Мориц и Вербье — все три.',
    places: [
      { label: 'Куршевель', resorts: ['osm-relation-21355703'], names: ['Куршевель', 'Courchevel'], country: 'FR', near: [45.41, 6.63], km: 10 },
      { label: 'Санкт-Мориц', resorts: ['skimap-1011', 'skimap-17107', 'skimap-17105'], names: ['Санкт-Мориц', 'St. Moritz', 'St Moritz', 'Sankt Moritz', 'Saint Moritz', 'Corviglia'], country: 'CH', near: [46.5, 9.84], km: 15 },
      { label: 'Вербье', resorts: ['skimap-989'], names: ['Вербье', 'Verbier', '4 Vallées – Verbier'], country: 'CH', near: [46.1, 7.23], km: 15 },
    ],
  },
  {
    id: 'rider-kamchatka',
    icon: '🚁',
    title: 'Heli-ski машина',
    why: 'За Камчатку — вулканы, хели-ски и спуски к океану.',
    places: [{ label: 'Камчатка', country: 'RU', area: kamchatka }],
  },
  {
    id: 'rider-mamison',
    icon: '🥧',
    title: 'Осетинский пирог',
    why: 'За Мамисон в Северной Осетии.',
    places: [{ label: 'Мамисон', resorts: ['osm-relation-20348154'], names: ['Мамисон', 'Mamison'], country: 'RU', near: [42.68, 43.83], km: 15 }],
  },
  {
    id: 'rider-manzherok',
    icon: '🧙',
    title: 'Колдун',
    why: 'За Манжерок на Алтае.',
    places: [{ label: 'Манжерок', resorts: ['skimap-5850'], names: ['Манжерок', 'Manzherok'], country: 'RU', near: [51.82, 85.8], km: 15 }],
  },
];

export interface RiderAchievement extends RiderAchievementDef {
  /** Places already visited, in the order of `places`. */
  got: boolean[];
  value: number;
  target: number;
  done: boolean;
}

/** A visited resort: the mark's id and, when the catalog is loaded, the resort itself. */
export interface VisitedResort {
  id: string;
  resort: Resort | null;
}

const located = (c: City): c is City & { lat: number; lon: number } => c.lat !== null && c.lon !== null;

function close(p: RiderPlace, lat: number, lon: number): boolean {
  if (!p.near) return true;
  return distanceKm({ lat, lon }, { lat: p.near[0], lon: p.near[1] }) <= (p.km ?? 20);
}

function namesMatch(p: RiderPlace, names: ReadonlyArray<string | null | undefined>): boolean {
  if (!p.names) return false;
  const want = new Set(p.names.map(normalize));
  return names.some((n) => !!n && want.has(normalize(n)));
}

export function placeVisited(p: RiderPlace, resorts: readonly VisitedResort[], cities: readonly City[]): boolean {
  for (const v of resorts) {
    if (p.resorts?.includes(v.id) || (v.resort && p.resorts?.includes(v.resort.id))) return true;
    const r = v.resort;
    if (!r || r.countryId !== p.country) continue;
    if (p.area?.(r.lat, r.lon)) return true;
    if (namesMatch(p, [r.name, r.nameRu, ...r.aliases]) && close(p, r.lat, r.lon)) return true;
  }
  for (const c of cities) {
    if (c.countryId !== p.country || !located(c)) continue;
    if (p.area?.(c.lat, c.lon)) return true;
    if (namesMatch(p, [c.name]) && close(p, c.lat, c.lon)) return true;
  }
  return false;
}

export function riderAchievements(resorts: readonly VisitedResort[], cities: readonly City[]): RiderAchievement[] {
  return RIDER_ACHIEVEMENTS.map((a) => {
    const got = a.places.map((p) => placeVisited(p, resorts, cities));
    const value = got.filter(Boolean).length;
    return { ...a, got, value, target: a.places.length, done: value === a.places.length };
  });
}
