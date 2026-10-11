import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildPhotoIndex, type PhotoIndex, readPhoto } from './photoGeo';
import { scanPhotos } from './photoScan';
import { COUNTRY_BY_ID } from './reference';

const root = join(__dirname, '../..');

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
    const pub = (f: string) => readFileSync(join(root, 'public/data', f), 'utf8');
    beforeAll(() => {
      r = buildPhotoIndex(pub('cities.tsv'), JSON.parse(pub('countries.geojson')), JSON.parse(pub('region-names.json')), new Set(COUNTRY_BY_ID.keys()));
    }, 60_000);

    const at = (lat: number, lon: number) => {
      const x = r.resolve({ lat, lon, date: null });
      return x ? { country: x.countryId, city: x.cityId ? r.place(x.cityId)?.ru : null } : null;
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
      const p = r.place(r.resolve({ lat: 41.2995, lon: 69.2401, date: null })!.cityId!);
      expect(p?.lat).toBeCloseTo(41.3, 1);
      expect(p?.region).not.toBe(undefined);
    });

    it('keeps a photo from a boat near the coast, drops the open ocean', () => {
      expect(at(43.25, 5.3)?.country).toBe('FR'); // bay of Marseille
      expect(at(30, -40)).toBeNull();
    });
  });

  it('scans a batch of photos with progress, as the worker does', async () => {
    vi.stubGlobal('fetch', async (url: URL | string) => {
      const body = readFileSync(join(root, 'public', new URL(String(url)).pathname), 'utf8');
      return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
    });
    const gps = new Uint8Array(readFileSync(join(__dirname, 'fixtures/gps.jpg')));
    const none = new Uint8Array(readFileSync(join(__dirname, 'fixtures/nogps.jpg')));
    const seen: number[] = [];
    const r = await scanPhotos([gps, none, gps], '2026-10-11', 'https://app.test/', (p) => seen.push(p.done));
    expect(r.located).toBe(2);
    expect(r.points.map((p) => [p.countryId, p.date])).toEqual([['TR', '2024-05-03'], ['TR', '2024-05-03']]);
    expect(r.places.map((p) => p.ru)).toEqual(['Стамбул']);
    expect(seen.at(-1)).toBe(3);
    vi.unstubAllGlobals();
  }, 60_000);
});
