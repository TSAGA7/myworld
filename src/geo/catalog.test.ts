import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchCountries } from './reference';
import { parseCatalog } from './catalog';

const catalog = parseCatalog(readFileSync(join(__dirname, '../../public/data/cities.tsv'), 'utf8'), {});
const first = (q: string, country?: string) => catalog.search(q, 5, country)[0];

describe('city search finds resort towns by the names people type', () => {
  it.each([
    ['Канны', 'FR', 'Cannes'],
    ['Канн', 'FR', 'Cannes'],
    ['Торевьеха', 'ES', 'Torrevieja'],
    ['Эльче', 'ES', 'Elche'],
    ['Торревьеха', 'ES', 'Torrevieja'],
    ['Торревиеха', 'ES', 'Torrevieja'],
    ['Альтеа', 'ES', 'Altea'],
    ['Монте-Карло', 'MC', 'Monte-Carlo'],
    ['Монте', 'MC', 'Monte-Carlo'],
    ['монте карло', 'MC', 'Monte-Carlo'],
    ['Ватикан', 'VA', 'Vatican City'],
    ['Анапа', 'RU', 'Anapa'],
    ['Домодедово', 'RU', 'Domodedovo'],
    ['Минеральные Воды', 'RU', 'Mineralnye Vody'],
    ['Шлиссельбург', 'RU', 'Shlissel’burg'],
    ['Севастополь', 'UA', 'Sevastopol'],
    ['Нерха', 'ES', 'Nerja'],
    ['Сан-Ремо', 'IT', 'San Remo'],
  ])('%s', (q, country, en) => {
    expect(first(q, country)?.en).toBe(en);
    if (q.length > 6) expect(catalog.search(q, 10).some((c) => c.en === en)).toBe(true);
  });

  it('keeps proper Russian names in the list', () => {
    expect(first('Канны', 'FR')?.ru).toBe('Канны');
    expect(first('Эльче', 'ES')?.ru).toBe('Эльче');
    expect(first('Смоленск', 'RU')?.ru).toBe('Смоленск');
    expect(first('Анапа', 'RU')?.ru).toBe('Анапа');
    expect(first('Новоуральск', 'RU')?.ru).toBe('Новоуральск');
    expect(first('Екатеринбург', 'RU')?.ru).toBe('Екатеринбург');
    expect(first('Кан', 'FR')?.en).toBe('Caen');
    expect(first('Канн')?.en).toBe('Cannes');
  });
});

describe('country search', () => {
  it('finds Monaco, Vatican and Kyrgyzstan under old names too', () => {
    expect(searchCountries('Монако')[0]?.id).toBe('MC');
    expect(searchCountries('Ватикан')[0]?.id).toBe('VA');
    expect(searchCountries('Кыргызстан')[0]?.ru).toBe('Кыргызстан');
    expect(searchCountries('Киргизия')[0]?.id).toBe('KG');
  });
});

describe('romanToRussian', () => {
  it('spells GeoNames Latin names of Russian towns back in Cyrillic', async () => {
    const { romanToRussian } = await import('../../scripts/city-fixes.mjs');
    expect(romanToRussian('Novoural’sk')).toBe('Новоуральск');
    expect(romanToRussian('Ust’-Dzheguta')).toBe('Усть-Джегута');
    expect(romanToRussian('Yablonovskiy')).toBe('Яблоновский');
    expect(romanToRussian('Staryye Atagi')).toBe('Старые Атаги');
    expect(romanToRussian('Sovetskoye')).toBe('Советское');
  });
});
