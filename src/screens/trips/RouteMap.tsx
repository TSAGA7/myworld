import { geoBounds, geoInterpolate, geoMercator, geoPath } from 'd3-geo';
import { memo, useEffect, useMemo, useState } from 'react';
import { type CountryFeature, loadCountryShapes } from '../../geo/geometry';

export interface RoutePoint {
  id: string;
  lon: number;
  lat: number;
  visited: boolean;
}

let shapesWithBounds: Promise<Array<{ f: CountryFeature; b: [[number, number], [number, number]] }>> | null = null;
const loadShapes = () => {
  shapesWithBounds ??= loadCountryShapes().then((s) => s.features.map((f) => ({ f, b: geoBounds(f) as [[number, number], [number, number]] })));
  return shapesWithBounds;
};

/**
 * Static route map drawn in SVG (no WebGL): countries, a dashed great-circle line with a plane, numbered stops.
 * Used on trip cards and the trip page so the app never runs a second WebGL scene.
 */
export const RouteMap = memo(function RouteMap({ points, width = 360, height = 180, numbered = true }: { points: RoutePoint[]; width?: number; height?: number; numbered?: boolean }) {
  const [shapes, setShapes] = useState<Awaited<ReturnType<typeof loadShapes>> | null>(null);
  useEffect(() => {
    let alive = true;
    loadShapes().then((s) => alive && setShapes(s), () => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const view = useMemo(() => {
    if (points.length === 0) return null;
    const lons = points.map((p) => p.lon);
    const lats = points.map((p) => p.lat);
    // At least ~6° of view, so a one-city trip still shows its surroundings.
    const pad = (a: number[], min: number): [number, number] => {
      const lo = Math.min(...a);
      const hi = Math.max(...a);
      const extra = Math.max(0, min - (hi - lo)) / 2;
      return [lo - extra, hi + extra];
    };
    const [w, e] = pad(lons, 8);
    const [s, n] = pad(lats, 5);
    const box: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPoint', coordinates: [[w, s], [e, n], [w, n], [e, s]] },
    };
    const proj = geoMercator().fitExtent(
      [
        [28, 26],
        [width - 28, height - 26],
      ],
      box,
    );
    return { proj, bbox: [w - 10, s - 8, e + 10, n + 8] as const };
  }, [points, width, height]);

  if (!view)
    return (
      <svg className="route-map" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width={width} height={height} fill="var(--map-ocean)" />
        <g transform={`translate(${width / 2 - 22},${height / 2 - 22}) scale(1.85)`} fill="none" stroke="var(--ink-3)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.6}>
          <path d="M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16" />
        </g>
      </svg>
    );
  const path = geoPath(view.proj);
  const [bw, bs, be, bn] = view.bbox;
  const visible = shapes?.filter(({ b }) => (b[0][0] > b[1][0] || (b[1][0] >= bw && b[0][0] <= be)) && b[1][1] >= bs && b[0][1] <= bn) ?? [];
  const xy = points.map((p) => view.proj([p.lon, p.lat]) ?? [0, 0]);

  // Great-circle legs between consecutive stops
  const legs: string[] = [];
  let plane: { x: number; y: number; a: number } | null = null;
  let longest = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as RoutePoint;
    const b = points[i] as RoutePoint;
    const interp = geoInterpolate([a.lon, a.lat], [b.lon, b.lat]);
    const pts = Array.from({ length: 24 }, (_, k) => (view.proj(interp(k / 23)) ?? [0, 0]) as [number, number]);
    legs.push('M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L'));
    const len = Math.hypot((xy[i]?.[0] ?? 0) - (xy[i - 1]?.[0] ?? 0), (xy[i]?.[1] ?? 0) - (xy[i - 1]?.[1] ?? 0));
    if (len > longest && len > 40) {
      longest = len;
      const m = pts[12] as [number, number];
      const m2 = pts[13] as [number, number];
      plane = { x: m[0], y: m[1], a: (Math.atan2(m2[1] - m[1], m2[0] - m[0]) * 180) / Math.PI };
    }
  }

  return (
    <svg className="route-map" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width={width} height={height} fill="var(--map-ocean)" />
      {visible.map(({ f }) => (
        <path key={f.properties.id} d={path(f) ?? ''} fill="var(--map-land)" stroke="var(--map-border)" strokeWidth={0.6} />
      ))}
      {legs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--ink)" strokeWidth={1.6} strokeDasharray="5 5" strokeLinecap="round" opacity={0.75} />
      ))}
      {plane && (
        <g transform={`translate(${plane.x},${plane.y}) rotate(${plane.a + 90})`}>
          <circle r={11} fill="var(--glass-solid)" stroke="var(--line-strong)" />
          <path transform="translate(-8,-8) scale(0.66)" d="M10.5 21l1.5-1v-6l8 3v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V10l-8 5v2l8-3v6l1.5 1z" fill="var(--ink)" />
        </g>
      )}
      {xy.map((p, i) => {
        const pt = points[i] as RoutePoint;
        return (
          <g key={`${pt.id}-${i}`} transform={`translate(${p[0]},${p[1]})`}>
            <circle r={numbered ? 10 : 6} fill={pt.visited ? 'var(--lime)' : 'var(--glass-solid)'} stroke={pt.visited ? '#fff' : 'var(--ink)'} strokeWidth={numbered ? 2 : 1.6} />
            {numbered && (
              <text textAnchor="middle" dy="0.35em" fontSize={10} fontWeight={700} fill={pt.visited ? '#1b1f05' : 'var(--ink)'}>
                {i + 1}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
});
