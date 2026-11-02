import { describe, expect, it } from 'vitest';
import type { Resort, Spot } from './hobby';
import { riderFacts, surfFacts } from './hobbyFacts';
import type { City } from './model';
import { surfAchievements } from './surfAchievements';

const resort = (id: string, name: string, countryId: string, lat: number, lon: number, extra: Partial<Resort> = {}): Resort =>
  ({ id, alt: [], name, nameRu: null, countryId, region: null, lat, lon, pisteKm: null, lifts: null, elevMin: null, elevMax: null, website: null, telegram: null, tgSource: null, cams: [], active: true, aliases: [], towns: [], ...extra }) as Resort;
const spot = (id: string, name: string, countryId: string, continent: string, group: string | null, lat: number, lon: number): Spot =>
  ({ id, name, countryId, continent, group, region: null, area: false, lat, lon, osm: null, wave: null, level: null, season: null, website: null, photo: null, src: null, active: true }) as Spot;
const msk = { id: 'msk', name: 'Москва', countryId: 'RU', lat: 55.75, lon: 37.62 } as City;
const name = (id: string) => ({ RU: 'Россия', GE: 'Грузия', ID: 'Индонезия', US: 'США', PT: 'Португалия' })[id] ?? id;

describe('hobby facts', () => {
  it('describes visited resorts', () => {
    const rows = riderFacts(
      [resort('a', 'Elbrus', 'RU', 43.28, 42.46, { nameRu: 'Эльбрус', elevMax: 3847 }), resort('b', 'Big Wood', 'RU', 67.6, 33.7, { nameRu: 'Большой Вудъявр', pisteKm: 30 }), resort('c', 'Gudauri', 'GE', 42.48, 44.48, { nameRu: 'Гудаури' })],
      name,
      msk,
    );
    const by = new Map(rows.map((r) => [r.id, r.text]));
    expect(by.get('r-count')).toBe('3 курорта в 2 странах');
    expect(by.get('r-high')).toMatch(/^Выше всего — Эльбрус, до 3\s847 м$/);
    expect(by.get('r-north')).toBe('Самый северный курорт — Большой Вудъявр (67.6° с. ш.)');
    expect(by.get('r-country')).toBe('Больше всего курортов — Россия: 2');
    expect(riderFacts([], name)).toEqual([]);
  });

  it('describes visited spots and favourites', () => {
    const spots = [spot('u', 'Uluwatu', 'ID', 'Азия', 'Бали', -8.8, 115.1), spot('c', 'Canggu', 'ID', 'Азия', 'Бали', -8.65, 115.13), spot('p', 'Pipeline', 'US', 'Северная Америка', 'Гавайи', 21.66, -158.05)];
    const by = new Map(surfFacts(spots, 1, name, msk).map((r) => [r.id, r.text]));
    expect(by.get('s-count')).toBe('3 спота в 2 странах');
    expect(by.get('s-group')).toBe('Больше всего спотов — Бали: 2');
    expect(by.get('s-fav')).toBe('В избранном — 1 спот');
    const ach = new Map(surfAchievements(spots, 3, name).map((a) => [a.id, a]));
    expect(ach.get('surf-1')?.done).toBe(true);
    expect(ach.get('surf-5')?.value).toBe(3);
    expect(ach.get('surf-bali')?.details).toEqual(['Uluwatu', 'Canggu']);
    expect(ach.get('surf-hawaii')?.done).toBe(true);
    expect(ach.get('surf-europe')?.done).toBe(false);
    expect(ach.get('surf-fav')?.done).toBe(true);
  });
});
