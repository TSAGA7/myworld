import type { Resort } from './hobby';
import { distanceKm } from './achievements';
import { normalize } from './search';

/**
 * Achievements of the Rider hobby (skis / snowboard). One file for all of them — the list will grow.
 *
 * Only ski resorts with «Был здесь» count: a city visited on a trip is not riding (a summer week in Красная Поляна
 * must not give «Russian Luxury»). A place counts by the resort's catalog id, or by its name/alias near the place
 * (ids can change), or for an area (Hokkaido) by any resort inside it.
 * An achievement with several places («Кавказский движ») needs all of them.
 *
 * Two kinds: RIDER_ACHIEVEMENTS (named places) and RIDER_COUNTERS (computed from the visited resorts: number of
 * resorts, countries, the highest top…). To add one: a new entry in either list. `icon` is an emoji, or `svg:<name>`
 * for a picture from ui/AchIcon.tsx.
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

/** One place of a named achievement in the window: ✓/○ and the resort that counted. */
export interface RiderPlaceState {
  label: string;
  got: boolean;
  /** The marked resort that gave the place, e.g. «Роза Хутор». */
  via: string | null;
}

export interface RiderAchievement {
  id: string;
  icon: string;
  title: string;
  why: string;
  /** Tile subtitle. */
  tile: string;
  value: number;
  target: number;
  done: boolean;
  /** Named achievements: their places. */
  places?: RiderPlaceState[];
  /** Counters: short «за что» lines. */
  details?: string[];
}

/** A visited resort: the mark's id and, when the catalog is loaded, the resort itself. */
export interface VisitedResort {
  id: string;
  resort: Resort | null;
}

const resortTitle = (r: Resort | null, id: string) => (r ? r.nameRu || r.name : id);

function close(p: RiderPlace, lat: number, lon: number): boolean {
  if (!p.near) return true;
  return distanceKm({ lat, lon }, { lat: p.near[0], lon: p.near[1] }) <= (p.km ?? 20);
}

function namesMatch(p: RiderPlace, names: ReadonlyArray<string | null | undefined>): boolean {
  if (!p.names) return false;
  const want = new Set(p.names.map(normalize));
  return names.some((n) => !!n && want.has(normalize(n)));
}

/** The visited resort that makes the place count, or null. */
export function placeResort(p: RiderPlace, resorts: readonly VisitedResort[]): VisitedResort | null {
  for (const v of resorts) {
    if (p.resorts?.includes(v.id) || (v.resort && p.resorts?.includes(v.resort.id))) return v;
    const r = v.resort;
    if (!r || r.countryId !== p.country) continue;
    if (p.area?.(r.lat, r.lon)) return v;
    if (namesMatch(p, [r.name, r.nameRu, ...r.aliases]) && close(p, r.lat, r.lon)) return v;
  }
  return null;
}

// ---------- counters: computed from all visited resorts (need the catalog for heights, km, countries)

interface Counter {
  id: string;
  icon: string;
  title: string;
  why: string;
  /** Short line on the tile. */
  tile: string;
  target: number;
  /** Progress and the «за что» lines. */
  run: (rs: ReadonlyArray<{ id: string; r: Resort | null }>, countryName: (id: string) => string) => { value: number; details: string[] };
}

const known = (rs: ReadonlyArray<{ id: string; r: Resort | null }>) => rs.map((x) => x.r).filter((r): r is Resort => !!r);
const count = (rs: ReadonlyArray<{ id: string; r: Resort | null }>) => ({ value: rs.length, details: rs.length <= 6 ? rs.map((x) => resortTitle(x.r, x.id)) : [] });
const best = (pick: (r: Resort) => number | null, ok: (v: number) => boolean, show: (r: Resort, v: number) => string) =>
  (rs: ReadonlyArray<{ id: string; r: Resort | null }>) => {
    const hits = known(rs)
      .map((r) => ({ r, v: pick(r) }))
      .filter((x): x is { r: Resort; v: number } => x.v !== null && ok(x.v))
      .sort((a, b) => b.v - a.v);
    return { value: hits.length ? 1 : 0, details: hits.slice(0, 3).map((x) => show(x.r, x.v)) };
  };
const ALPS: Array<[string, string, (r: Resort) => boolean]> = [
  ['FR', 'Франция', (r) => r.lat >= 44 && r.lon >= 5.5],
  ['CH', 'Швейцария', () => true],
  ['AT', 'Австрия', () => true],
  ['IT', 'Италия', (r) => r.lat >= 45.4],
];

export const RIDER_COUNTERS: Counter[] = [
  { id: 'rider-5', icon: '🎿', title: 'Курортный сезон', tile: '5 курортов', why: '«Был здесь» на пяти курортах.', target: 5, run: count },
  { id: 'rider-15', icon: '🏂', title: 'Коллекционер склонов', tile: '15 курортов', why: '«Был здесь» на пятнадцати курортах.', target: 15, run: count },
  { id: 'rider-30', icon: '🗻', title: 'Горный кочевник', tile: '30 курортов', why: '«Был здесь» на тридцати курортах.', target: 30, run: count },
  {
    id: 'rider-countries', icon: '🛂', title: 'Без границ', tile: 'Курорты в 5 странах', why: 'Курорты в пяти разных странах.', target: 5,
    run: (rs, name) => {
      const ids = [...new Set(known(rs).map((r) => r.countryId))];
      return { value: ids.length, details: ids.map(name) };
    },
  },
  { id: 'rider-3000', icon: '☁️', title: 'Над облаками', tile: 'Курорт выше 3000 м', why: 'Курорт, где подъёмники забираются выше 3000 м.', target: 1, run: best((r) => r.elevMax, (v) => v >= 3000, (r, v) => `${resortTitle(r, r.id)} — ${v.toLocaleString('ru-RU')} м`) },
  { id: 'rider-300km', icon: '🛣️', title: 'Бесконечные трассы', tile: 'Курорт с 300+ км трасс', why: 'Курорт, где больше 300 км трасс.', target: 1, run: best((r) => r.pisteKm, (v) => v >= 300, (r, v) => `${resortTitle(r, r.id)} — ${Math.round(v)} км`) },
  {
    id: 'rider-alps', icon: '🧀', title: 'Альпийская четвёрка', tile: 'Франция, Швейцария, Австрия, Италия', why: 'Альпы во всех четырёх странах: Франция, Швейцария, Австрия и Италия.', target: 4,
    run: (rs) => {
      const got = ALPS.filter(([c, , inAlps]) => known(rs).some((r) => r.countryId === c && inAlps(r))).map(([, label]) => label);
      return { value: got.length, details: got };
    },
  },
  { id: 'rider-polar', icon: '❄️', title: 'Полярный райдер', tile: 'За полярным кругом', why: 'Курорт за полярным кругом.', target: 1, run: best((r) => r.lat, (v) => v >= 66.56, (r) => resortTitle(r, r.id)) },
  { id: 'rider-south', icon: '🐧', title: 'Лето — это зима', tile: 'Южное полушарие', why: 'Курорт в южном полушарии: Анды, Новая Зеландия, Австралия…', target: 1, run: best((r) => -r.lat, (v) => v > 0, (r) => resortTitle(r, r.id)) },
  {
    id: 'rider-america', icon: '🦅', title: 'Американ дрим', tile: 'США или Канада', why: 'Курорт в США или Канаде.', target: 1,
    run: (rs) => {
      const hits = known(rs).filter((r) => r.countryId === 'US' || r.countryId === 'CA');
      return { value: hits.length ? 1 : 0, details: hits.slice(0, 3).map((r) => resortTitle(r, r.id)) };
    },
  },
];

export function riderAchievements(resorts: readonly VisitedResort[], countryName: (id: string) => string = (id) => id): RiderAchievement[] {
  const named: RiderAchievement[] = RIDER_ACHIEVEMENTS.map((a) => {
    const places = a.places.map((p) => {
      const v = placeResort(p, resorts);
      return { label: p.label, got: !!v, via: v ? resortTitle(v.resort, v.id) : null };
    });
    const value = places.filter((p) => p.got).length;
    return { id: a.id, icon: a.icon, title: a.title, why: a.why, tile: a.places.map((p) => p.label).join(', '), places, value, target: places.length, done: value === places.length };
  });
  // One resort once, even when it is marked under an old and a new id.
  const seen = new Set<string>();
  const unique = resorts.filter((v) => {
    const key = v.resort?.id ?? v.id;
    return !seen.has(key) && !!seen.add(key);
  }).map((v) => ({ id: v.id, r: v.resort }));
  const counters: RiderAchievement[] = RIDER_COUNTERS.map((c) => {
    const { value, details } = c.run(unique, countryName);
    return { id: c.id, icon: c.icon, title: c.title, why: c.why, tile: c.tile, details, value: Math.min(value, c.target), target: c.target, done: value >= c.target };
  });
  return [...named, ...counters];
}
