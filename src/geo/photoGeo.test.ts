import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { encodePhotoIndex } from '../../scripts/photo-index.mjs';
import { buildPhotoIndex, type FoundPlace, type PhotoIndex, readCatalogRows, readPhoto } from './photoGeo';
import { scanPhotos } from './photoScan';
import { COUNTRY_BY_ID } from './reference';

const root = join(__dirname, '../..');

const POINTS: Array<[number, number]> = [
  [41.0142, 28.9793], [55.7539, 37.6208], [48.8584, 2.2945], [41.8902, 12.4922], [55.7494, 37.5372], [36.8841, 30.7056],
  [13.7465, 100.4927], [42.8746, 74.6122], [43.2389, 76.8897], [41.2995, 69.2401], [43.25, 5.3],
];

describe('photo geo', () => {
  it('reads place and day from an iPhone-style JPEG, and nothing from a photo without location', async () => {
    const gps = new Uint8Array(readFileSync(join(__dirname, 'fixtures/gps.jpg')));
    const p = await readPhoto(gps, '2026-10-11');
    expect(p?.date).toBe('2024-05-03');
    expect(p?.lat).toBeCloseTo(41.0142, 3);
    expect(p?.lon).toBeCloseTo(28.9793, 3);
    expect(await readPhoto(new Uint8Array(readFileSync(join(__dirname, 'fixtures/nogps.jpg'))), '2026-10-11')).toBeNull();
    expect(await readPhoto(new Uint8Array([1, 2, 3]), '2026-10-11')).toBeNull();
  });

  describe('resolver on the real country borders and city catalog', () => {
    let r: PhotoIndex;
    let names: Map<number, FoundPlace>;
    const pub = (f: string) => readFileSync(join(root, 'public/data', f), 'utf8');
    const tsv = pub('cities.tsv');
    // Every row the tests ask about is read once from the real catalog file, as the app does.
    const nameOf = async (rows: number[]) => {
      const stream = new Blob([tsv]).stream() as ReadableStream<Uint8Array>;
      return readCatalogRows(stream, new Set(rows), JSON.parse(pub('region-names.json')));
    };
    beforeAll(async () => {
      const bin = encodePhotoIndex(tsv);
      r = buildPhotoIndex(bin.buffer as ArrayBuffer, JSON.parse(pub('countries.geojson')), new Set(COUNTRY_BY_ID.keys()));
      const rows: number[] = [];
      for (const [lat, lon] of POINTS) {
        const x = r.resolve({ lat, lon, date: null });
        if (x?.cityId) rows.push(Number(x.cityId));
      }
      names = await nameOf(rows);
    }, 60_000);

    const at = (lat: number, lon: number) => {
      const x = r.resolve({ lat, lon, date: null });
      return x ? { country: x.countryId, city: x.cityId ? names.get(Number(x.cityId))?.ru : null } : null;
    };

    it('finds the country and the city', () => {
      expect(at(41.0142, 28.9793)).toEqual({ country: 'TR', city: 'Стамбул' });
      expect(at(55.7539, 37.6208)).toEqual({ country: 'RU', city: 'Москва' });
      expect(at(48.8584, 2.2945)).toEqual({ country: 'FR', city: 'Париж' });
      expect(at(41.8902, 12.4922)).toEqual({ country: 'IT', city: 'Рим' });
      // Suburbs and outskirts go to the big city, not to a village a bit closer.
      expect(at(55.7494, 37.5372)).toEqual({ country: 'RU', city: 'Москва' }); // Moscow City
      expect(at(36.8841, 30.7056)).toEqual({ country: 'TR', city: 'Анталья' });
      expect(at(13.7465, 100.4927)).toEqual({ country: 'TH', city: 'Бангкок' });
    });

    it('resolves thousands of photos quickly', () => {
      const t = performance.now();
      for (let i = 0; i < 5000; i++) r.resolve({ lat: 35 + (i % 100) * 0.13, lon: 20 + Math.floor(i / 100) * 0.4, date: null });
      expect(performance.now() - t).toBeLessThan(5000);
    });

    it('finds the places of a Central Asia trip', () => {
      expect(at(42.8746, 74.6122)).toEqual({ country: 'KG', city: 'Бишкек' });
      expect(at(43.2389, 76.8897)).toEqual({ country: 'KZ', city: 'Алма-Ата' });
      expect(at(41.2995, 69.2401)).toEqual({ country: 'UZ', city: 'Ташкент' });
      const p = names.get(Number(r.resolve({ lat: 41.2995, lon: 69.2401, date: null })!.cityId));
      expect(p?.lat).toBeCloseTo(41.3, 1);
      expect(p?.id).toMatch(/^(ne|gn):/);
      expect(p?.region).toBeTruthy();
    });

    it('keeps a photo from a boat near the coast, drops the open ocean', () => {
      expect(at(43.25, 5.3)?.country).toBe('FR'); // bay of Marseille
      expect(at(30, -40)).toBeNull();
    });
  });

  it('scans a batch of photos with progress, as the worker does', async () => {
    const tsv = readFileSync(join(root, 'public/data/cities.tsv'), 'utf8');
    const idx = buildPhotoIndex(encodePhotoIndex(tsv).buffer as ArrayBuffer, JSON.parse(readFileSync(join(root, 'public/data/countries.geojson'), 'utf8')), new Set(COUNTRY_BY_ID.keys()));
    const gps = new Uint8Array(readFileSync(join(__dirname, 'fixtures/gps.jpg')));
    const none = new Uint8Array(readFileSync(join(__dirname, 'fixtures/nogps.jpg')));
    const seen: number[] = [];
    const r = await scanPhotos(idx, [gps, none, gps], '2026-10-11', (p) => seen.push(p.done));
    expect(r.located).toBe(2);
    expect(r.points.map((p) => [p.countryId, p.date])).toEqual([['TR', '2024-05-03'], ['TR', '2024-05-03']]);
    expect(seen.at(-1)).toBe(3);
  }, 60_000);

  it('reads only the needed lines of a streamed file, across chunk borders', async () => {
    const text = 'a\tА\tA\tRU\t1\t2\t\tR1\nb\tБ\tB\tKZ\t3\t4\t\t\nc\tВ\t\tUZ\t5\t6\t\t\n';
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3));
        c.close();
      },
    });
    const out = await readCatalogRows(stream, new Set([0, 2]), { R1: 'Регион' });
    expect([...out.entries()]).toEqual([
      [0, { id: 'a', ru: 'А', en: 'A', countryId: 'RU', lat: 1, lon: 2, region: 'Регион' }],
      [2, { id: 'c', ru: 'В', en: 'В', countryId: 'UZ', lat: 5, lon: 6, region: '' }],
    ]);
  });
});
