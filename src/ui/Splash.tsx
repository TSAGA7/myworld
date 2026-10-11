import { geoDistance, geoInterpolate, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo';
import { useEffect, useRef, useState } from 'react';
import { useWorld } from '../app/world';
import { type LonLat, planSplashFlights, type SplashPlan } from '../domain/splashFlights';
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

    let plan: SplashPlan | null = null;
    let t0 = 0; // when the plan was made: the globe spins and planes fly from then on
    let raf = 0;
    let finished = false;

    const makePlan = (): SplashPlan => {
      const { settings: st, cities: cs, world: w } = data.current;
      const home = st.homeCityId ? cs.get(st.homeCityId) : undefined;
      const origin: LonLat | null = home && home.lat !== null && home.lon !== null ? [home.lon, home.lat] : null;
      const dest: LonLat[] = [];
      for (const id of w.visitedCityIds) {
        const c = cs.get(id);
        if (c && c.lat !== null && c.lon !== null) dest.push([c.lon, c.lat]);
      }
      // keep up to 8 far-apart visited cities
      const spread: LonLat[] = [];
      if (dest.length) spread.push(dest[0] as LonLat);
      while (spread.length < Math.min(8, dest.length)) {
        let best = dest[0] as LonLat;
        let bestD = -1;
        for (const p of dest) {
          const d = Math.min(...spread.map((o) => geoDistance(o, p)));
          if (d > bestD) {
            bestD = d;
            best = p;
          }
        }
        spread.push(best);
      }
      let focus = origin;
      if (!focus && spread.length) {
        // centre of the visited cities (as a unit vector average, so it works across the antimeridian)
        let x = 0;
        let y = 0;
        let z = 0;
        for (const [lo, la] of spread) {
          const l = (lo * Math.PI) / 180;
          const p = (la * Math.PI) / 180;
          x += Math.cos(p) * Math.cos(l);
          y += Math.cos(p) * Math.sin(l);
          z += Math.sin(p);
        }
        focus = [(Math.atan2(y, x) * 180) / Math.PI, (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI];
      }
      return planSplashFlights(focus, spread);
    };

    let t = 0;
    let last = 0;
    const frame = (now: number) => {
      // Animation time advances with painted frames (at most 1/15 s per frame): while the phone is busy starting
      // the app the planes wait instead of skipping their flight.
      t += last ? Math.min((now - last) / 1000, 1 / 15) : 0;
      last = now;
      if (!plan && (data.current.ready || t > 0.35)) {
        plan = makePlan();
        t0 = t;
      }
      const ft = plan ? t - t0 : 0;
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
      const center = plan?.center ?? [0, 0];
      const proj = geoOrthographic()
        .scale(R)
        .translate([cx, cy])
        .rotate([-(center[0] + (plan?.spin ?? 0) * ft), -center[1]])
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
      if (shapes && plan) {
        ctx.globalAlpha = appear * Math.min(1, ft / 0.3);
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
      ctx.globalAlpha = appear;
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
      for (const fl of plan?.flights ?? []) {
        const k = Math.max(0, Math.min(1, (ft - fl.start) / fl.dur));
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
          const since = ft - fl.start - fl.dur;
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

      if (ft >= TOTAL && !finished) {
        finished = true;
        setLeaving(true);
        window.setTimeout(() => done.current(), FADE * 1000);
      }
      if (!plan || ft < TOTAL + FADE) raf = requestAnimationFrame(frame);
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
