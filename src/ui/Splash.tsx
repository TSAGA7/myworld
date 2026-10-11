import { geoDistance, geoInterpolate, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { useEffect, useRef, useState } from 'react';
import { useWorld } from '../app/world';
import { type CountryShapes, loadCountryShapes } from '../geo/geometry';

export const SPLASH_OFF_KEY = 'mw-splash-off';

/** Whether the launch animation is turned off (mirrored to localStorage so it's known before the database opens). */
export function splashOff(): boolean {
  try {
    return localStorage.getItem(SPLASH_OFF_KEY) === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
export function setSplashOff(off: boolean) {
  try {
    if (off) localStorage.setItem(SPLASH_OFF_KEY, '1');
    else localStorage.removeItem(SPLASH_OFF_KEY);
  } catch {
    /* private mode */
  }
}

type LonLat = [number, number];
interface Flight {
  from: LonLat;
  to: LonLat;
  start: number; // s
  dur: number; // s
  lift: number;
}

/** Big hubs used when the user has no cities yet. */
const HUBS: LonLat[] = [
  [37.62, 55.75], // Moscow
  [2.35, 48.86], // Paris
  [-74.0, 40.71], // New York
  [139.69, 35.69], // Tokyo
  [55.27, 25.2], // Dubai
  [28.98, 41.01], // Istanbul
  [100.5, 13.75], // Bangkok
  [12.5, 41.9], // Rome
  [31.24, 30.04], // Cairo
  [-43.2, -22.9], // Rio
  [116.4, 39.9], // Beijing
  [103.82, 1.35], // Singapore
  [-0.13, 51.5], // London
  [44.8, 41.72], // Tbilisi
];

const TOTAL = 2.9; // s, then fade out
const FADE = 0.45;
const PLANE = new Path2D('M10.5 21l1.5-1v-6l8 3v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V10l-8 5v2l8-3v6l1.5 1z');

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Launch animation: a glowing planet with planes flying along dashed arcs to their destinations. Tap to skip. */
export function Splash({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { ready, settings, cities, world } = useWorld();
  const data = useRef({ ready, settings, cities, world });
  data.current = { ready, settings, cities, world };
  const [leaving, setLeaving] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return void done.current();
    let shapes: CountryShapes | null = null;
    loadCountryShapes()
      .then((s) => (shapes = s))
      .catch(() => undefined);

    let flights: Flight[] | null = null;
    let center: LonLat = [40, 35];
    let raf = 0;
    let finished = false;

    const pickFlights = () => {
      const { settings: st, cities: cs, world: w } = data.current;
      const home = st.homeCityId ? cs.get(st.homeCityId) : undefined;
      const origin: LonLat | null = home && home.lat !== null && home.lon !== null ? [home.lon, home.lat] : null;
      const dest: LonLat[] = [];
      for (const id of w.visitedCityIds) {
        const c = cs.get(id);
        if (c && c.lat !== null && c.lon !== null && (!origin || geoDistance(origin, [c.lon, c.lat]) > 0.05)) dest.push([c.lon, c.lat]);
      }
      // spread destinations: keep the farthest-apart ones
      const pickSpread = (pts: LonLat[], n: number) => {
        if (pts.length <= n) return pts;
        const out: LonLat[] = [pts[0] as LonLat];
        while (out.length < n) {
          let best = pts[0] as LonLat;
          let bestD = -1;
          for (const p of pts) {
            const d = Math.min(...out.map((o) => geoDistance(o, p)));
            if (d > bestD) {
              bestD = d;
              best = p;
            }
          }
          out.push(best);
        }
        return out;
      };
      const pairs: Array<[LonLat, LonLat]> = [];
      const o = origin ?? (HUBS[0] as LonLat);
      const targets = dest.length >= 3 ? pickSpread(dest, 9) : HUBS.filter((h) => geoDistance(h, o) > 0.1).slice(0, 9);
      for (const t of targets) pairs.push([o, t]);
      // a couple of extra flights between destinations so the sky isn't one fan
      for (let i = 0; i + 1 < targets.length && pairs.length < 12; i += 3) pairs.push([targets[i] as LonLat, targets[i + 1] as LonLat]);
      center = [o[0] + 12, Math.max(-35, Math.min(45, o[1] - 12))];
      return pairs.map(([from, to], i) => {
        const dist = geoDistance(from, to);
        return { from, to, start: 0.15 + (i % 6) * 0.11 + Math.floor(i / 6) * 0.25, dur: 1.15 + dist * 0.18, lift: 0.06 + Math.min(0.3, dist * 0.09) };
      });
    };

    let t = 0;
    let last = 0;
    const frame = (now: number) => {
      // Animation time advances with painted frames (at most 1/15 s per frame): while the phone is busy starting
      // the app the planes wait instead of skipping their flight.
      t += last ? Math.min((now - last) / 1000, 1 / 15) : 0;
      last = now;
      if (!flights && (data.current.ready || t > 0.35)) flights = pickFlights();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (canvas.width !== Math.round(W * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const R = Math.min(W, H) * 0.36;
      const cx = W / 2;
      const cy = H * 0.46;
      const spin = t * 7;
      const proj = geoOrthographic()
        .scale(R)
        .translate([cx, cy])
        .rotate([-(center[0] + spin - 10), -center[1]])
        .clipAngle(90);
      const path = geoPath(proj, ctx);

      // glow
      const appear = Math.min(1, t / 0.5);
      ctx.globalAlpha = appear;
      const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.45);
      halo.addColorStop(0, 'rgba(160,220,255,0.35)');
      halo.addColorStop(0.35, 'rgba(120,180,255,0.12)');
      halo.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.45, 0, Math.PI * 2);
      ctx.fill();
      // sphere
      const sea = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      sea.addColorStop(0, '#2b4f86');
      sea.addColorStop(0.6, '#13243f');
      sea.addColorStop(1, '#0a1222');
      ctx.fillStyle = sea;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      // land
      if (shapes) {
        const visited = data.current.world.countryStatus;
        for (const f of shapes.features) {
          ctx.beginPath();
          path(f);
          ctx.fillStyle = visited.get(f.properties.id) === 'visited' ? 'rgba(221,243,111,0.75)' : 'rgba(190,215,255,0.22)';
          ctx.fill();
        }
        ctx.beginPath();
        path({ type: 'FeatureCollection', features: shapes.features } as GeoPermissibleObjects);
        ctx.strokeStyle = 'rgba(210,230,255,0.35)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
      // rim light
      const rim = ctx.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
      rim.addColorStop(0, 'rgba(255,255,255,0)');
      rim.addColorStop(1, 'rgba(170,215,255,0.28)');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      // flights
      const rot = proj.rotate();
      const viewCenter: LonLat = [-rot[0], -rot[1]];
      const lifted = (p: LonLat, h: number): { x: number; y: number; vis: boolean } | null => {
        const g = proj(p); // point projection isn't clipped: back-side points land inside the disc
        if (!g) return null;
        const x = cx + (g[0] - cx) * (1 + h);
        const y = cy + (g[1] - cy) * (1 + h);
        const front = geoDistance(p, viewCenter) < Math.PI / 2;
        const outside = Math.hypot(x - cx, y - cy) > R;
        return { x, y, vis: front || outside };
      };
      for (const fl of flights ?? []) {
        const k = Math.max(0, Math.min(1, (t - fl.start) / fl.dur));
        if (k <= 0) continue;
        const e = ease(k);
        const interp = geoInterpolate(fl.from, fl.to);
        const N = 48;
        // dashed trail up to the plane
        ctx.setLineDash([3.5, 4.5]);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        let pen = false;
        let last: { x: number; y: number } | null = null;
        let prev: { x: number; y: number } | null = null;
        const steps = Math.max(2, Math.round(N * e));
        for (let i = 0; i <= steps; i++) {
          const s = (i / steps) * e;
          const q = lifted(interp(s) as LonLat, Math.sin(Math.PI * s) * fl.lift);
          if (!q || !q.vis) {
            pen = false;
            continue;
          }
          if (pen) ctx.lineTo(q.x, q.y);
          else ctx.moveTo(q.x, q.y);
          pen = true;
          prev = last;
          last = q;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        // origin dot
        const a = lifted(fl.from, 0);
        if (a?.vis) {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.arc(a.x, a.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        // destination: appears when the plane lands
        const b = lifted(fl.to, 0);
        if (b?.vis && k >= 1) {
          const since = t - fl.start - fl.dur;
          const pulse = Math.min(1, since / 0.35);
          ctx.fillStyle = `rgba(221,243,111,${0.35 * (1 - pulse)})`;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 4 + pulse * 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ddf36f';
          ctx.beginPath();
          ctx.arc(b.x, b.y, 3.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#0b0d12';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        // plane
        if (k < 1 && last && prev) {
          const ang = Math.atan2(last.y - prev.y, last.x - prev.x);
          ctx.save();
          ctx.translate(last.x, last.y);
          ctx.rotate(ang + Math.PI / 2);
          ctx.scale(0.62, 0.62);
          ctx.translate(-10.5, -12);
          ctx.shadowColor = 'rgba(221,243,111,0.9)';
          ctx.shadowBlur = 10;
          ctx.fillStyle = '#ffffff';
          ctx.fill(PLANE);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;

      if (t >= TOTAL && !finished) {
        finished = true;
        setLeaving(true);
        window.setTimeout(() => done.current(), FADE * 1000);
      }
      if (t < TOTAL + FADE) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const skip = () => {
    setLeaving(true);
    window.setTimeout(() => done.current(), 220);
  };

  return (
    <div className={`splash ${leaving ? 'leaving' : ''}`} onClick={skip} role="presentation" aria-hidden="true">
      <canvas ref={ref} className="splash-canvas" />
      <div className="splash-title">
        <span className="thin">MY</span> WORLD
      </div>
    </div>
  );
}
