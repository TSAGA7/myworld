import { geoDistance } from 'd3-geo';
import { describe, expect, it } from 'vitest';
import { type LonLat, planSplashFlights, SPLASH_LAND_BY } from './splashFlights';

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const italy: LonLat[] = [
  [12.5, 41.9],
  [9.19, 45.46],
  [11.25, 43.77],
  [14.27, 40.85],
];
const k = (p: LonLat) => p.join(',');

describe('splash flights', () => {
  for (const [name, focus, visited] of [
    ['Moscow home, Italy visited', [37.62, 55.75], italy],
    ['no data', null, []],
    ['Sydney', [151.21, -33.87], []],
  ] as Array<[string, LonLat | null, LonLat[]]>) {
    it(`are chaotic: ${name}`, () => {
      for (let s = 1; s < 30; s++) {
        const { flights } = planSplashFlights(focus, visited, seeded(s * 7919));
        expect(flights.length).toBeGreaterThanOrEqual(10);
        // many different origins and directions, not a fan from one point
        expect(new Set(flights.map((f) => k(f.from))).size).toBeGreaterThanOrEqual(6);
        expect(new Set(flights.map((f) => k(f.to))).size).toBeGreaterThanOrEqual(6);
        const dirs = new Set(flights.map((f) => Math.round(Math.atan2(f.to[1] - f.from[1], f.to[0] - f.from[0]) / (Math.PI / 4))));
        expect(dirs.size).toBeGreaterThanOrEqual(4);
        for (const f of flights) {
          expect(geoDistance(f.from, f.to)).toBeGreaterThan(0.3);
          expect(f.start).toBeGreaterThanOrEqual(0);
          expect(f.start + f.dur).toBeLessThanOrEqual(SPLASH_LAND_BY + 1e-9);
        }
        // starts are staggered
        expect(Math.max(...flights.map((f) => f.start)) - Math.min(...flights.map((f) => f.start))).toBeGreaterThan(0.5);
      }
    });
  }
  it('lands some planes in visited cities', () => {
    const { flights } = planSplashFlights([37.62, 55.75], italy, seeded(42));
    expect(flights.filter((f) => italy.some((v) => k(v) === k(f.to))).length).toBeGreaterThanOrEqual(3);
  });
  it('differs between launches', () => {
    const a = planSplashFlights(null, italy, seeded(1)).flights.map((f) => k(f.from) + k(f.to));
    const b = planSplashFlights(null, italy, seeded(2)).flights.map((f) => k(f.from) + k(f.to));
    expect(a.join()).not.toBe(b.join());
  });
});
