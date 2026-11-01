import { z } from 'zod';
import { normalize } from './search';

/** Hobbies: Rider (skis OR snowboard, never both) and Surf; any combination of the two is allowed. */
export type RiderType = 'ski' | 'snowboard';
export type HobbyKind = 'resort' | 'spot';
export interface Hobbies {
  rider: RiderType | null;
  surf: boolean;
}

export const RIDER_LABEL: Record<RiderType, string> = { ski: 'Лыжи', snowboard: 'Борд' };
export const RIDER_FULL: Record<RiderType, string> = { ski: 'Горные лыжи', snowboard: 'Сноуборд' };
/** Owner's jokes shown once after the choice. Irony only — never used as safety advice anywhere else. */
export const RIDER_JOKE: Record<RiderType, { title: string; text: string }> = {
  ski: { title: 'Отлично!', text: 'Тех, кто не сидит по центру склона, стало меньше!' },
  snowboard: { title: 'Супер!', text: 'Никогда не забывай, что самое безопасное место для отдыха — центр трассы!' },
};

/** Tabs of «Мой мир»: the hobby tabs exist only while the hobby is on. */
export type WorldScope = 'world' | 'home' | 'rider' | 'surf';
export function worldScopes(h: Hobbies): WorldScope[] {
  const s: WorldScope[] = ['world', 'home'];
  if (h.rider) s.push('rider');
  if (h.surf) s.push('surf');
  return s;
}

// ---------- catalogs (published by .github/workflows/catalog.yml to the `data` branch)

export const cameraSchema = z.object({
  name: z.string(),
  place: z.string().nullish(),
  url: z.string().url(),
  /** iframe — official embed; hls — public stream; image — official snapshot that refreshes; link — opens the official page. */
  kind: z.enum(['iframe', 'hls', 'image', 'link']),
  /** The camera's own page on the resort site — opened when the stream plays only there. */
  page: z.string().url().nullish(),
});
export type Camera = z.infer<typeof cameraSchema>;

const num = z.number().nullish().transform((v) => v ?? null);
const str = z.string().nullish().transform((v) => v || null);

export const resortSchema = z.object({
  id: z.string(),
  alt: z.array(z.string()).default([]),
  name: z.string(),
  nameRu: str,
  countryId: z.string(),
  region: str,
  lat: z.number(),
  lon: z.number(),
  pisteKm: num,
  lifts: num,
  elevMin: num,
  elevMax: num,
  website: str,
  telegram: str,
  /** official — channel checked by hand; wikidata — taken from Wikidata. */
  tgSource: z.enum(['official', 'wikidata']).nullish().transform((v) => v ?? null),
  cams: z.array(cameraSchema).default([]),
  active: z.boolean().default(true),
  /** Other names people search by: the mountains («Хибины»), Russian spellings («Куршевель»). From resorts-extra.json. */
  aliases: z.array(z.string()).default([]),
  /** Towns next to the slopes (GeoNames, ≤ 20 km): «Кировск» finds «Большой Вудъявр». */
  towns: z.array(z.string()).default([]),
});
export type Resort = z.infer<typeof resortSchema>;

export const spotSchema = z.object({
  id: z.string(),
  name: z.string(),
  countryId: z.string(),
  continent: str,
  /** Island / coast the spot belongs to («Бали», «Ментавайские острова»). */
  group: str,
  region: str,
  area: z.boolean().default(false),
  lat: z.number(),
  lon: z.number(),
  osm: str,
  wave: str,
  level: str,
  season: str,
  website: str,
  photo: str,
  src: str,
  active: z.boolean().default(true),
});
export type Spot = z.infer<typeof spotSchema>;

export const resortsFileSchema = z.object({ generatedAt: z.string(), attribution: z.string().default(''), items: z.array(resortSchema) });
export const spotsFileSchema = z.object({ generatedAt: z.string(), attribution: z.string().default(''), items: z.array(spotSchema) });
export type ResortsFile = z.infer<typeof resortsFileSchema>;
export type SpotsFile = z.infer<typeof spotsFileSchema>;

export type Place = Resort | Spot;
export const placeTitle = (p: Place): string => ('nameRu' in p && p.nameRu ? p.nameRu : p.name);
export const placeSubtitle = (p: Place): string | null => ('nameRu' in p && p.nameRu && p.nameRu !== p.name ? p.name : null);

/** Map of every id a place was ever published under (resorts gain a Wikidata id later) → current place. */
export function indexPlaces<T extends Place>(items: readonly T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const p of items) {
    if (!p.active) continue;
    m.set(p.id, p);
    if ('alt' in p) for (const a of p.alt) if (!m.has(a)) m.set(a, p);
  }
  return m;
}

/** Visited places that are in the catalog now; a mark stored under an old id still counts once. */
export function visitedIn<T extends Place>(index: ReadonlyMap<string, T>, placeIds: Iterable<string>): Set<string> {
  const s = new Set<string>();
  for (const id of placeIds) {
    const p = index.get(id);
    if (p) s.add(p.id);
  }
  return s;
}

export function hobbyProgress(items: readonly Place[], visited: ReadonlySet<string>): { visited: number; total: number; percent: number } {
  const active = items.filter((p) => p.active);
  const v = active.filter((p) => visited.has(p.id)).length;
  const total = active.length;
  return { visited: v, total, percent: total ? Math.round((v / total) * 1000) / 10 : 0 };
}

const RUSSIA = 'RU';
export const inRussia = (p: Place): boolean => p.countryId === RUSSIA;

/** Search by name, country and region (countryName resolves the Russian country name). */
const namesOf = (p: Place): string[] =>
  [p.name, 'nameRu' in p ? p.nameRu : null, ...('aliases' in p ? p.aliases : []), ...('towns' in p ? p.towns : [])].filter((x): x is string => !!x);

export function placeMatches(p: Place, q: string, countryName: (id: string) => string): boolean {
  const nq = normalize(q);
  if (!nq) return true;
  const hay = [...namesOf(p), countryName(p.countryId), p.region, 'group' in p ? p.group : null].filter((x): x is string => !!x);
  return hay.some((h) => normalize(h).includes(nq));
}

const CYR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ы: 'y', ю: 'yu', я: 'ya' };

/**
 * Sound skeleton of a word, the same for Russian and Latin spelling: «Куршавель», «Куршевель» and «Courchevel» → krsvl,
 * «Церматт» and «Zermatt» → srmt, «Кицбюэль» and «Kitzbühel» → ksbl. Sibilants merge, vowels and h drop.
 */
export function soundKey(word: string): string {
  const latin = [...normalize(word)].map((c) => CYR[c] ?? c).join('');
  return latin
    .replace(/tsch|sch|ch|sh|zh|kh|j/g, 's')
    .replace(/ts|tz|z|x/g, 's')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/ck|c|q/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/w/g, 'v')
    .replace(/[^a-z0-9]/g, '')
    .replace(/[aeiouyh]/g, '')
    .replace(/(.)\1+/g, '$1');
}

/** Spelling-tolerant match by sound: every word of the query (3+ consonants) starts a word of one of the names. */
export function placeSoundsLike(p: Place, q: string): boolean {
  const qk = normalize(q).split(' ').map(soundKey).filter(Boolean);
  if (!qk.length || qk.join('').length < 3) return false;
  return namesOf(p).some((n) => {
    const words = normalize(n).split(' ').map(soundKey);
    return qk.every((k) => words.some((w) => w.startsWith(k)));
  });
}

export interface PlaceGroup<T extends Place> {
  countryId: string;
  items: T[];
  /** Spots: sub-groups by island/coast, in catalog order. */
  sub: Array<{ name: string; items: T[] }>;
  visited: number;
}

/** Countries (A–Я by Russian name), each with its places; spots are further split by island/coast. */
export function groupByCountry<T extends Place>(items: readonly T[], visited: ReadonlySet<string>, countryName: (id: string) => string): PlaceGroup<T>[] {
  const by = new Map<string, T[]>();
  for (const p of items) if (p.active) by.set(p.countryId, [...(by.get(p.countryId) ?? []), p]);
  return [...by.entries()]
    .map(([countryId, list]) => {
      const sorted = [...list].sort((a, b) => placeTitle(a).localeCompare(placeTitle(b), 'ru'));
      const subs = new Map<string, T[]>();
      for (const p of list) {
        const key = ('group' in p ? p.group : null) ?? p.region ?? '';
        subs.set(key, [...(subs.get(key) ?? []), p]);
      }
      return {
        countryId,
        items: sorted,
        sub: [...subs.entries()].map(([name, its]) => ({ name, items: its })),
        visited: list.filter((p) => visited.has(p.id)).length,
      };
    })
    .sort((a, b) => countryName(a.countryId).localeCompare(countryName(b.countryId), 'ru'));
}

/** Readable facts of a resort; empty values are left out (the page hides the block). */
export function resortFacts(r: Resort): Array<{ label: string; value: string }> {
  const f: Array<{ label: string; value: string }> = [];
  if (r.pisteKm) f.push({ label: 'трасс', value: `${r.pisteKm} км` });
  if (r.lifts) f.push({ label: 'подъёмников', value: String(r.lifts) });
  if (r.elevMin !== null && r.elevMax !== null && r.elevMax > r.elevMin) f.push({ label: 'высота катания', value: `${r.elevMin}–${r.elevMax} м` });
  else if (r.elevMax !== null) f.push({ label: 'высшая точка', value: `${r.elevMax} м` });
  return f;
}

export const mapLink = (p: Place): string => ('osm' in p && p.osm ? `https://www.openstreetmap.org/${p.osm}` : `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=13/${p.lat}/${p.lon}`);

// ---------- «Сейчас тут» and resort notices

export interface WatchMark {
  what: string;
  kind: string;
  placeId: string;
  until: string | null;
}
export interface ResortWatch {
  /** Resorts where the user is now (status not expired). */
  here: Set<string>;
  /** «Сейчас тут» whose time ran out: the app asks «Вы ещё тут?». */
  expired: string[];
  /** Resorts whose notices the user gets: here (not muted) or switched on by hand. */
  notify: Set<string>;
}

/** Ids are resolved through the catalog index, so a mark made under an old id still works. */
export function resortWatch(marks: readonly WatchMark[], index: ReadonlyMap<string, { id: string }>, now: Date): ResortWatch {
  const id = (m: WatchMark) => index.get(m.placeId)?.id ?? null;
  const of = (what: string) => marks.filter((m) => m.kind === 'resort' && m.what === what);
  const here = new Set<string>();
  const expired: string[] = [];
  for (const m of of('here')) {
    const r = id(m);
    if (!r) continue;
    if (m.until && Date.parse(m.until) < now.getTime()) expired.push(r);
    else here.add(r);
  }
  const muted = new Set(of('mute').map(id).filter((x): x is string => !!x));
  const notify = new Set<string>([...here].filter((r) => !muted.has(r)));
  for (const m of of('notify')) {
    const r = id(m);
    if (r) notify.add(r);
  }
  return { here, expired, notify };
}
