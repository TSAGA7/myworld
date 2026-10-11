import { geoGraticule10, geoNaturalEarth1, geoOrthographic, geoPath, type GeoProjection } from 'd3-geo';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { PlaceStatus } from '../../domain/world';
import { type CountryShapes, loadCountryShapes } from '../../geo/geometry';
import type { MapApi, PlaceCollection } from './MapView';

/**
 * Light SVG map used when WebGL is unavailable or the user chose the light mode on a weak phone.
 * Same data and callbacks as the WebGL map; the globe view is an orthographic projection you can turn by dragging.
 */
export const FallbackMap = forwardRef<
  MapApi,
  {
    globe: boolean;
    countryStatus: ReadonlyMap<string, PlaceStatus>;
    places: PlaceCollection;
    selectedCountry: string | null;
    selectedCity: string | null;
    focusPoint: [number, number] | null;
    picking: boolean;
    onCity(id: string): void;
    onCountry(id: string): void;
    onPick(lon: number, lat: number): void;
    onBackground(): void;
  }
>(function FallbackMap(props, ref) {
  const [shapes, setShapes] = useState<CountryShapes | null>(null);
  const [size, setSize] = useState({ w: 390, h: 760 });
  const [rot, setRot] = useState<[number, number]>([-30, -25]);
  const [zoom, setZoom] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; r: [number, number]; moved: boolean } | null>(null);

  useEffect(() => {
    loadCountryShapes().then(setShapes, () => undefined);
  }, []);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const projection: GeoProjection = useMemo(() => {
    const base = Math.min(size.w, size.h);
    if (props.globe) return geoOrthographic().scale(base * 0.42 * zoom).translate([size.w / 2, size.h * 0.45]).rotate([rot[0], rot[1]]).clipAngle(90);
    return geoNaturalEarth1().scale((size.w / 5.6) * zoom).translate([size.w / 2, size.h * 0.42]).rotate([rot[0], 0]);
  }, [props.globe, size, rot, zoom]);
  const path = useMemo(() => geoPath(projection), [projection]);

  useImperativeHandle(ref, () => ({
    flyTo(lon, lat, z = 4) {
      setRot([-lon, -lat]);
      setZoom(Math.min(6, Math.max(1, z / 2)));
    },
    fitBounds(b) {
      const lon = (b[0] + b[2]) / 2;
      const lat = (b[1] + b[3]) / 2;
      setRot([-lon, -lat]);
      setZoom(Math.min(5, Math.max(1, 60 / Math.max(b[2] - b[0], (b[3] - b[1]) * 1.6, 1))));
    },
    zoomBy(d) {
      setZoom((z) => Math.min(8, Math.max(0.8, z * (d > 0 ? 1.5 : 1 / 1.5))));
    },
    resize() {},
  }));

  const fill = (id: string) => {
    const s = props.countryStatus.get(id);
    return s === 'visited' ? 'var(--map-visited)' : s === 'planned' ? 'var(--paper-2)' : 'var(--map-land)';
  };

  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, r: rot, moved: false };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    const k = 0.35 / zoom;
    setRot([d.r[0] + dx * k, props.globe ? Math.max(-80, Math.min(80, d.r[1] - dy * k)) : 0]);
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) return;
    if (props.picking) {
      const rect = box.current?.getBoundingClientRect();
      const ll = rect && projection.invert?.([e.clientX - rect.left, e.clientY - rect.top]);
      if (ll) props.onPick(ll[0], ll[1]);
      return;
    }
    const target = e.target as SVGElement;
    const city = target.closest('[data-city]')?.getAttribute('data-city');
    const country = target.closest('[data-country]')?.getAttribute('data-country');
    if (city) props.onCity(city);
    else if (country) props.onCountry(country);
    else props.onBackground();
  };

  return (
    <div ref={box} className="map-canvas fallback-map" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} role="application" aria-label="Карта мира (упрощённая)">
      <svg width={size.w} height={size.h}>
        {props.globe && <circle cx={size.w / 2} cy={size.h * 0.45} r={Math.min(size.w, size.h) * 0.42 * zoom} fill="var(--map-ocean)" stroke="var(--map-border)" />}
        <path d={path(geoGraticule10()) ?? ''} fill="none" stroke="var(--map-border)" strokeOpacity={0.35} strokeWidth={0.5} />
        {shapes?.features.map((f) => (
          <path
            key={f.properties.id}
            data-country={f.properties.id}
            d={path(f) ?? ''}
            fill={fill(f.properties.id)}
            stroke={f.properties.id === props.selectedCountry ? 'var(--ink)' : props.countryStatus.get(f.properties.id) === 'planned' ? 'var(--map-planned)' : 'var(--map-border)'}
            strokeWidth={f.properties.id === props.selectedCountry ? 1.8 : 0.5}
            strokeDasharray={props.countryStatus.get(f.properties.id) === 'planned' ? '3 2' : undefined}
          />
        ))}
        {props.places.features.map((p) => {
          const xy = projection(p.geometry.coordinates as [number, number]);
          if (!xy) return null;
          if (props.globe && path({ type: 'Point', coordinates: p.geometry.coordinates }) === null) return null;
          const v = p.properties.status === 'visited';
          return (
            <g key={p.properties.id} data-city={p.properties.id} transform={`translate(${xy[0]},${xy[1]})`} style={{ cursor: 'pointer' }}>
              <rect x={-9} y={-24} width={18} height={18} rx={6} fill={v ? 'var(--lime)' : 'var(--graphite)'} stroke="#fff" strokeWidth={2} />
              <path d="M-4 -5 L0 1 L4 -5" fill={v ? 'var(--lime)' : 'var(--graphite)'} />
              {p.properties.id === props.selectedCity && <circle r={14} cy={-15} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
            </g>
          );
        })}
        {props.focusPoint &&
          (() => {
            const xy = projection(props.focusPoint);
            return xy ? <circle cx={xy[0]} cy={xy[1]} r={8} fill="var(--lime)" stroke="var(--graphite)" strokeWidth={2.5} /> : null;
          })()}
      </svg>
      {!shapes && <div className="map-loading"><span className="spinner" /></div>}
    </div>
  );
});
