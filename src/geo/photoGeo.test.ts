import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadPhotoResolver, type PhotoResolver, readPhoto } from './photoGeo';

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
    let r: PhotoResolver;
    beforeAll(async () => {
      vi.stubGlobal('fetch', async (url: string) => {
        const file = join(root, 'public', url.replace(/^\//, ''));
        const body = readFileSync(file, 'utf8');
        return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
      });
      r = await loadPhotoResolver();
    }, 60_000);

    const at = (lat: number, lon: number) => {
      const x = r.resolve({ lat, lon, date: null });
      return x ? { country: x.countryId, city: x.cityId ? r.city(x.cityId)?.ru : null } : null;
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

    it('keeps a photo from a boat near the coast, drops the open ocean', () => {
      expect(at(43.25, 5.3)?.country).toBe('FR'); // bay of Marseille
      expect(at(30, -40)).toBeNull();
    });
  });
});
