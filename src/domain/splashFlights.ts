import { geoDistance } from 'd3-geo';

export type LonLat = [number, number];
export interface SplashFlight {
  from: LonLat;
  to: LonLat;
  start: number; // s
  dur: number; // s
  lift: number;
}
export interface SplashPlan {
  flights: SplashFlight[];
  /** Point in the middle of the screen at the start; the globe then spins east by `spin` degrees per second. */
  center: LonLat;
  spin: number;
}

/** Big cities all over the world: origins and destinations for the launch animation. */
export const SPLASH_HUBS: LonLat[] = [
  [37.62, 55.75], // Moscow
  [2.35, 48.86], // Paris
  [-0.13, 51.5], // London
  [-74.0, 40.71], // New York
  [-118.24, 34.05], // Los Angeles
  [-99.13, 19.43], // Mexico City
  [-43.2, -22.9], // Rio
  [-58.38, -34.6], // Buenos Aires
  [-21.94, 64.15], // Reykjavik
  [139.69, 35.69], // Tokyo
  [126.98, 37.57], // Seoul
  [116.4, 39.9], // Beijing
  [103.82, 1.35], // Singapore
  [100.5, 13.75], // Bangkok
  [151.21, -33.87], // Sydney
  [77.21, 28.61], // Delhi
  [55.27, 25.2], // Dubai
  [28.98, 41.01], // Istanbul
  [31.24, 30.04], // Cairo
  [36.82, -1.29], // Nairobi
  [18.42, -33.92], // Cape Town
  [3.38, 6.52], // Lagos
  [76.89, 43.24], // Almaty
  [82.92, 55.03], // Novosibirsk
  [44.8, 41.72], // Tbilisi
  [12.5, 41.9], // Rome
  [-3.7, 40.42], // Madrid
  [174.76, -36.85], // Auckland
  [115.86, -31.95], // Perth
  [106.85, -6.21], // Jakarta
  [120.98, 14.6], // Manila
  [114.17, 22.32], // Hong Kong
  [-157.86, 21.31], // Honolulu
  [-149.9, 61.22], // Anchorage
  [-123.12, 49.28], // Vancouver
  [-70.67, -33.45], // Santiago
  [-77.04, -12.05], // Lima
  [131.89, 43.12], // Vladivostok
  [60.6, 56.84], // Yekaterinburg
];

export const SPLASH_LAND_BY = 2.6; // every plane has landed by then (the splash lasts ~2.9 s)
const SPIN = 22; // °/s
const COUNT = 13;
const MID = SPLASH_LAND_BY / 2;

/**
 * Chaotic flights for the launch animation: different origins, directions and lengths all around the visible side of a
 * spinning globe. Some of them land in the user's visited cities (`visited`), centred on `focus` (home city or visited places).
 */
export function planSplashFlights(focus: LonLat | null, visited: LonLat[], rnd: () => number = Math.random): SplashPlan {
  const f = focus ?? (SPLASH_HUBS[0] as LonLat);
  // f is in the middle of the screen halfway through the animation
  const center: LonLat = [f[0] - SPIN * MID, Math.max(-30, Math.min(40, f[1] - 10))];
  const viewAt = (t: number): LonLat => [center[0] + SPIN * t, center[1]];
  const mid = viewAt(MID);

  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length) % xs.length] as T;
  const shuffle = <T,>(xs: T[]): T[] => {
    const a = xs.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j] as T, a[i] as T];
    }
    return a;
  };
  const same = (a: LonLat, b: LonLat) => geoDistance(a, b) < 0.02;

  // points on (or just over the horizon of) the side the viewer sees during the animation
  const pool = SPLASH_HUBS.filter((p) => geoDistance(p, mid) < 1.55);
  for (const v of visited) if (!pool.some((p) => same(p, v))) pool.push(v);
  const myDest = shuffle(visited.filter((v) => geoDistance(v, mid) < 1.55));

  const flights: SplashFlight[] = [];
  const usedFrom = new Map<string, number>();
  const usedTo = new Map<string, number>();
  const key = (p: LonLat) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  let mine = 0;
  for (let attempt = 0; flights.length < COUNT && attempt < COUNT * 40; attempt++) {
    const wantMine = mine < Math.min(5, myDest.length) && flights.length % 2 === 0;
    const to = wantMine ? (myDest[mine] as LonLat) : pick(pool);
    const from = pick(pool);
    const dist = geoDistance(from, to);
    if (dist < 0.35 || dist > 2.4) continue; // too short to see / goes too far behind the planet
    if ((usedFrom.get(key(from)) ?? 0) >= 2 || (usedTo.get(key(to)) ?? 0) >= 2) continue;
    if (flights.some((x) => (same(x.from, from) && same(x.to, to)) || (same(x.from, to) && same(x.to, from)))) continue;
    usedFrom.set(key(from), (usedFrom.get(key(from)) ?? 0) + 1);
    usedTo.set(key(to), (usedTo.get(key(to)) ?? 0) + 1);
    if (wantMine) mine++;
    const dur = Math.min(1.9, 0.85 + dist * 0.35) * (0.85 + rnd() * 0.3);
    const latest = Math.max(0.05, SPLASH_LAND_BY - dur);
    const start = Math.min(latest, 0.05 + rnd() * 1.3);
    flights.push({ from, to, start, dur: Math.min(dur, SPLASH_LAND_BY - start), lift: 0.05 + Math.min(0.32, dist * 0.1) * (0.7 + rnd() * 0.6) });
  }
  return { flights, center, spin: SPIN };
}
