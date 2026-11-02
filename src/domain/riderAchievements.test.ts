import { describe, expect, it } from 'vitest';
import type { Resort } from './hobby';
import { RIDER_ACHIEVEMENTS, RIDER_COUNTERS, riderAchievements, type VisitedResort } from './riderAchievements';

const resort = (id: string, name: string, countryId: string, lat: number, lon: number, extra: Partial<Resort> = {}): Resort =>
  ({ id, alt: [], name, nameRu: null, countryId, region: null, lat, lon, pisteKm: null, lifts: null, elevMin: null, elevMax: null, website: null, telegram: null, tgSource: null, cams: [], active: true, aliases: [], towns: [], ...extra }) as Resort;
const ach = (marks: VisitedResort[], id: string) => riderAchievements(marks).find((a) => a.id === id)!;
const mark = (id: string, r: Resort | null = null): VisitedResort => ({ id, resort: r });

describe('rider achievements', () => {
  it('has unique ids and a reason for every achievement', () => {
    const ids = [...RIDER_ACHIEVEMENTS, ...RIDER_COUNTERS].map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of [...RIDER_ACHIEVEMENTS, ...RIDER_COUNTERS]) expect(a.why.length).toBeGreaterThan(5);
  });

  it('counts only resorts marked «Был здесь»: nothing marked — nothing got (no cities from trips)', () => {
    const all = riderAchievements([]);
    expect(all.filter((a) => a.value > 0)).toEqual([]);
  });

  it('gives «Северный вайб» for the Kirovsk resort mark', () => {
    expect(ach([mark('skimap-1951')], 'rider-north').done).toBe(true);
  });

  it('needs all three places for «Кавказский движ» and tells which resort counted', () => {
    const two = [mark('skimap-13636', resort('skimap-13636', 'Arhyz', 'RU', 43.55, 41.18, { nameRu: 'Архыз' })), mark('x', resort('new-id', 'Elbrus', 'RU', 43.28, 42.46))];
    const a = ach(two, 'rider-caucasus');
    expect(a.places?.map((p) => p.got)).toEqual([true, true, false]);
    expect(a.places?.[0]?.via).toBe('Архыз');
    expect(a.done).toBe(false);
  });

  it('does not give Krasnaya Polyana for Rosa Khutor or Gazprom (their towns include «Красная Поляна»)', () => {
    const marks = [
      mark('skimap-2678', resort('skimap-2678', 'Rosa Khutor', 'RU', 43.631, 40.313, { towns: ['Красная Поляна'] })),
      mark('skimap-1947', resort('skimap-1947', 'Gazprom', 'RU', 43.684, 40.317, { towns: ['Красная Поляна'] })),
    ];
    expect(ach(marks, 'rider-luxury').places?.map((p) => p.got)).toEqual([false, true, true]);
  });

  it('counts any resort of Hokkaido, not of Honshu', () => {
    expect(ach([mark('n', resort('skimap-2776', 'Niseko United', 'JP', 42.86, 140.67))], 'rider-hokkaido').done).toBe(true);
    expect(ach([mark('h', resort('h', 'Hakuba', 'JP', 36.7, 137.86))], 'rider-hokkaido').done).toBe(false);
  });

  it('finds Old Money places by alias (Corviglia is St. Moritz)', () => {
    const marks = [
      mark('a', resort('a', 'Courchevel', 'FR', 45.405, 6.63)),
      mark('b', resort('b', 'Corviglia', 'CH', 46.508, 9.819, { aliases: ['Санкт-Мориц'] })),
      mark('c', resort('c', '4 Vallées – Verbier', 'CH', 46.121, 7.29)),
    ];
    expect(ach(marks, 'rider-oldmoney').done).toBe(true);
  });

  it('computes the counters from visited resorts', () => {
    const marks = [
      mark('a', resort('a', 'Elbrus', 'RU', 43.28, 42.46, { elevMax: 3847 })),
      mark('b', resort('b', 'Les Trois Vallées', 'FR', 45.35, 6.58, { pisteKm: 600 })),
      mark('c', resort('c', 'Ischgl', 'AT', 47.01, 10.29)),
      mark('d', resort('d', 'Corviglia', 'CH', 46.5, 9.82)),
      mark('e', resort('e', 'Cervinia', 'IT', 45.93, 7.63)),
      mark('f', resort('f', 'Cerro Catedral', 'AR', -41.17, -71.44)),
      mark('f-old', resort('f', 'Cerro Catedral', 'AR', -41.17, -71.44)),
    ];
    const by = (id: string) => ach(marks, id);
    expect(by('rider-5').value).toBe(5); // six marks, «f» twice under an old id → still six resorts, capped at 5
    expect(by('rider-5').done).toBe(true);
    expect(by('rider-countries').done).toBe(true);
    expect(by('rider-3000').details?.map((d) => d.replace(/\s/g, ' '))).toEqual(['Elbrus — 3 847 м']);
    expect(by('rider-300km').done).toBe(true);
    expect(by('rider-alps').done).toBe(true);
    expect(by('rider-south').details).toEqual(['Cerro Catedral']);
    expect(by('rider-polar').done).toBe(false);
    expect(by('rider-america').value).toBe(0);
  });
});
