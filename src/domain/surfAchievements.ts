import type { Spot } from './hobby';
import type { RiderAchievement } from './riderAchievements';

/**
 * Achievements of the Surf hobby. Like the rider ones, only spots with «Был здесь» count; favourites count only for
 * «Мой спот». To add one: a new entry in SURF_ACHIEVEMENTS.
 */
export type HobbyAchievement = RiderAchievement;

interface SurfDef {
  id: string;
  icon: string;
  title: string;
  why: string;
  tile: string;
  target: number;
  run: (spots: readonly Spot[], ctx: { favourites: number; countryName: (id: string) => string }) => { value: number; details: string[] };
}

const title = (s: Spot) => s.name;
const countOf = (spots: readonly Spot[]) => ({ value: spots.length, details: spots.length <= 6 ? spots.map(title) : [] });
const anyOf = (test: (s: Spot) => boolean) => (spots: readonly Spot[]) => {
  const hits = spots.filter(test);
  return { value: hits.length ? 1 : 0, details: hits.slice(0, 3).map(title) };
};
const hawaii = (s: Spot) => s.group === 'Гавайи' || (s.countryId === 'US' && s.lat > 18 && s.lat < 23 && s.lon > -161 && s.lon < -154);

export const SURF_ACHIEVEMENTS: SurfDef[] = [
  { id: 'surf-1', icon: '🏄', title: 'Первая волна', why: '«Был здесь» на первом споте.', tile: 'Первый спот', target: 1, run: countOf },
  { id: 'surf-5', icon: '🌊', title: 'Сёрф-трип', why: '«Был здесь» на пяти спотах.', tile: '5 спотов', target: 5, run: countOf },
  { id: 'surf-15', icon: '🐚', title: 'Ловец волн', why: '«Был здесь» на пятнадцати спотах.', tile: '15 спотов', target: 15, run: countOf },
  { id: 'surf-30', icon: '☀️', title: 'Вечное лето', why: '«Был здесь» на тридцати спотах.', tile: '30 спотов', target: 30, run: countOf },
  {
    id: 'surf-countries', icon: '🛂', title: 'Волны без границ', why: 'Споты в пяти разных странах.', tile: 'Споты в 5 странах', target: 5,
    run: (spots, { countryName }) => {
      const ids = [...new Set(spots.map((s) => s.countryId))];
      return { value: ids.length, details: ids.map(countryName) };
    },
  },
  {
    id: 'surf-continents', icon: '🌍', title: 'Океаны мира', why: 'Споты на трёх континентах.', tile: '3 континента', target: 3,
    run: (spots) => {
      const list = [...new Set(spots.map((s) => s.continent).filter((c): c is string => !!c))];
      return { value: list.length, details: list };
    },
  },
  { id: 'surf-bali', icon: '🌺', title: 'Бали-вайб', why: 'Спот на Бали: Улувату, Чангу, Керамас…', tile: 'Бали', target: 1, run: anyOf((s) => s.group === 'Бали' || s.region === 'Бали') },
  { id: 'surf-hawaii', icon: '🌈', title: 'Алоха', why: 'Спот на Гавайях — родине сёрфинга.', tile: 'Гавайи', target: 1, run: anyOf(hawaii) },
  { id: 'surf-europe', icon: '🥖', title: 'Европейский свелл', why: 'Спот в Европе: Португалия, Франция, Испания…', tile: 'Европа', target: 1, run: anyOf((s) => s.continent === 'Европа') },
  {
    id: 'surf-fav', icon: '❤️', title: 'Мой спот', why: 'Три спота в избранном.', tile: '3 в избранном', target: 3,
    run: (_spots, { favourites }) => ({ value: favourites, details: [] }),
  },
];

/** `spots` — visited spots found in the catalog (one per place). */
export function surfAchievements(spots: readonly Spot[], favourites: number, countryName: (id: string) => string = (id) => id): HobbyAchievement[] {
  return SURF_ACHIEVEMENTS.map((d) => {
    const { value, details } = d.run(spots, { favourites, countryName });
    return { id: d.id, icon: d.icon, title: d.title, why: d.why, tile: d.tile, details, value: Math.min(value, d.target), target: d.target, done: value >= d.target };
  });
}
