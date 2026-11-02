import { describe, expect, it } from 'vitest';
import type { City } from './model';
import type { Resort } from './hobby';
import { RIDER_ACHIEVEMENTS, riderAchievements, type VisitedResort } from './riderAchievements';

const NOW = '2026-01-01T00:00:00.000Z';
const city = (name: string, countryId: string, lat: number, lon: number): City =>
  ({ id: name, name, nameEn: '', countryId, lat, lon, region: '', source: 'catalog', createdAt: NOW, updatedAt: NOW }) as City;
const resort = (id: string, name: string, countryId: string, lat: number, lon: number, extra: Partial<Resort> = {}): Resort =>
  ({ id, alt: [], name, nameRu: null, countryId, region: null, lat, lon, pisteKm: null, lifts: null, elevMin: null, elevMax: null, website: null, telegram: null, tgSource: null, cams: [], active: true, aliases: [], towns: [], ...extra }) as Resort;
const byId = (list: ReturnType<typeof riderAchievements>, id: string) => list.find((a) => a.id === id)!;

describe('rider achievements', () => {
  it('has unique ids and a reason for every achievement', () => {
    expect(new Set(RIDER_ACHIEVEMENTS.map((a) => a.id)).size).toBe(RIDER_ACHIEVEMENTS.length);
    for (const a of RIDER_ACHIEVEMENTS) expect(a.why.length).toBeGreaterThan(5);
  });

  it('gives «Северный вайб» for the Kirovsk resort mark or the city in the Khibiny — not for Kirovsk near Petersburg', () => {
    expect(byId(riderAchievements([{ id: 'skimap-1951', resort: null }], []), 'rider-north').done).toBe(true);
    expect(byId(riderAchievements([], [city('Кировск', 'RU', 67.61, 33.67)]), 'rider-north').done).toBe(true);
    expect(byId(riderAchievements([], [city('Кировск', 'RU', 59.88, 30.99)]), 'rider-north').done).toBe(false);
  });

  it('needs all three places for «Кавказский движ» and shows which are done', () => {
    const two: VisitedResort[] = [{ id: 'skimap-13636', resort: null }, { id: 'x', resort: resort('new-id', 'Elbrus', 'RU', 43.28, 42.46) }];
    const a = byId(riderAchievements(two, []), 'rider-caucasus');
    expect(a.got).toEqual([true, true, false]);
    expect(a.done).toBe(false);
    const all = byId(riderAchievements(two, [city('Домбай', 'RU', 43.29, 41.62)]), 'rider-caucasus');
    expect(all.done).toBe(true);
  });

  it('does not count the whole of Krasnaya Polyana for one village', () => {
    const a = byId(riderAchievements([], [city('Красная Поляна', 'RU', 43.68, 40.2)]), 'rider-luxury');
    expect(a.value).toBe(1);
    const b = byId(riderAchievements([{ id: 'skimap-3093', resort: null }, { id: 'skimap-2678', resort: null }, { id: 'skimap-1947', resort: null }], []), 'rider-luxury');
    expect(b.done).toBe(true);
  });

  it('counts any resort or city of Hokkaido and Kamchatka, but not Honshu or Magadan', () => {
    expect(byId(riderAchievements([{ id: 'n', resort: resort('skimap-2776', 'Niseko United', 'JP', 42.86, 140.67) }], []), 'rider-hokkaido').done).toBe(true);
    expect(byId(riderAchievements([], [city('Саппоро', 'JP', 43.06, 141.35)]), 'rider-hokkaido').done).toBe(true);
    expect(byId(riderAchievements([], [city('Хакуба', 'JP', 36.7, 137.86)]), 'rider-hokkaido').done).toBe(false);
    expect(byId(riderAchievements([], [city('Петропавловск-Камчатский', 'RU', 53.04, 158.65)]), 'rider-kamchatka').done).toBe(true);
    expect(byId(riderAchievements([], [city('Магадан', 'RU', 59.56, 150.8)]), 'rider-kamchatka').done).toBe(false);
  });

  it('finds Old Money places by alias (Corviglia is St. Moritz)', () => {
    const marks: VisitedResort[] = [
      { id: 'a', resort: resort('a', 'Courchevel', 'FR', 45.405, 6.63) },
      { id: 'b', resort: resort('b', 'Corviglia', 'CH', 46.508, 9.819, { aliases: ['Санкт-Мориц'] }) },
      { id: 'c', resort: resort('c', '4 Vallées – Verbier', 'CH', 46.121, 7.29) },
    ];
    expect(byId(riderAchievements(marks, []), 'rider-oldmoney').done).toBe(true);
  });
});
