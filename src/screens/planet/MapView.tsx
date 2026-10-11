import 'maplibre-gl/dist/maplibre-gl.css';
import maplibregl, { type GeoJSONSource, type LngLatBoundsLike, type Map as MlMap, type MapGeoJSONFeature } from 'maplibre-gl';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { PlaceStatus } from '../../domain/world';
import { COUNTRIES } from '../../geo/reference';
import { installMarkerImages, resetMarkerImages } from './markers';
import {
  baseStyle,
  countryLayers,
  detailLayers,
  detailReachable,
  type MapPalette,
  OFM_ATTRIBUTION,
  OFM_GLYPHS,
  OFM_TILES,
  readPalette,
  sky,
} from './mapStyle';

export interface PlaceFeatureProps {
  id: string;
  status: 'visited' | 'planned';
  trips: number;
}
export type PlaceCollection = GeoJSON.FeatureCollection<GeoJSON.Point, PlaceFeatureProps>;
export type PoiCollection = GeoJSON.FeatureCollection<GeoJSON.Point, { id: string; kind: 'stay' | 'booking' }>;

export interface MapApi {
  flyTo(lon: number, lat: number, zoom?: number): void;
  fitBounds(b: [number, number, number, number], maxZoom?: number): void;
  zoomBy(d: number): void;
  resize(): void;
}

interface Props {
  globe: boolean;
  lite: boolean;
  detail: boolean;
  /** The planet tab is visible: rendering and auto-rotation pause otherwise. */
  active: boolean;
  countryStatus: ReadonlyMap<string, PlaceStatus>;
  places: PlaceCollection;
  pois: PoiCollection;
  onPoi(id: string, kind: 'stay' | 'booking'): void;
  selectedCity: string | null;
  selectedCountry: string | null;
  /** Ring for a selected city that has no pin. */
  focusPoint: [number, number] | null;
  picking: boolean;
  onCity(id: string): void;
  onCountry(id: string): void;
  onPick(lon: number, lat: number): void;
  onBackground(): void;
  onFailure(message: string): void;
  onDetail(state: 'on' | 'off' | 'unavailable'): void;
}

const COUNTRIES_URL = `${import.meta.env.BASE_URL}data/countries.geojson`;
const SMALL: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: COUNTRIES.filter((c) => c.small).map((c) => ({ type: 'Feature', properties: { id: c.id }, geometry: { type: 'Point', coordinates: c.label } })),
};

/** Interactive map: MapLibre in flat (Mercator) or globe projection. One WebGL scene serves both views. */
export const MapView = forwardRef<MapApi, Props>(function MapView(props, ref) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const loaded = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const applied = useRef(new Map<string, PlaceStatus>());
  const palette = useRef<MapPalette | null>(null);
  const interacting = useRef(0);

  useImperativeHandle(ref, () => ({
    flyTo(lon, lat, zoom = 5) {
      const m = mapRef.current;
      if (!m) return;
      interacting.current = performance.now();
      m.flyTo({ center: [lon, lat], zoom: Math.max(zoom, 2), speed: 1.4, curve: 1.5, essential: true, padding: { top: 0, bottom: 220, left: 0, right: 0 } });
    },
    fitBounds(b, maxZoom = 6) {
      const m = mapRef.current;
      if (!m) return;
      interacting.current = performance.now();
      // Bounds crossing the antimeridian come as west > east: MapLibre handles them when east is shifted by 360.
      const bounds: LngLatBoundsLike = b[0] > b[2] ? [b[0], b[1], b[2] + 360, b[3]] : b;
      m.fitBounds(bounds, { padding: { top: 120, bottom: 260, left: 40, right: 40 }, maxZoom, duration: 1400, essential: true });
    },
    zoomBy(d) {
      const m = mapRef.current;
      if (!m) return;
      interacting.current = performance.now();
      m.easeTo({ zoom: m.getZoom() + d, duration: 300 });
    },
    resize() {
      mapRef.current?.resize();
    },
  }));

  // ---- create once
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const p = readPalette();
    palette.current = p;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: el,
        style: baseStyle(p, latest.current.globe, latest.current.lite, COUNTRIES_URL),
        center: [30, 30],
        zoom: initialZoom(el, latest.current.globe),
        minZoom: 0.6,
        maxZoom: 12,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        renderWorldCopies: true,
        fadeDuration: 150,
        maxTileCacheSize: 120,
      });
    } catch (e) {
      latest.current.onFailure(e instanceof Error ? e.message : 'WebGL недоступен');
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    installMarkerImages(map, () => document.documentElement.dataset.theme === 'dark');

    const lose = () => latest.current.onFailure('Видеокарта телефона сбросила карту');
    map.getCanvas().addEventListener('webglcontextlost', lose);
    map.on('error', (e) => {
      // Missing optional tiles/glyphs must not break the app: they only lose detail.
      if (import.meta.env.DEV) console.warn('map:', e.error?.message);
    });

    map.on('load', () => {
      loaded.current = true;
      (map.getSource('small') as GeoJSONSource).setData(SMALL);
      (map.getSource('places') as GeoJSONSource).setData(latest.current.places);
      (map.getSource('pois') as GeoJSONSource).setData(latest.current.pois);
      syncStates();
      syncSelection();
      syncFocus();
    });
    map.on('sourcedata', (e) => {
      if (e.sourceId === 'countries' && e.isSourceLoaded) syncStates(true);
    });

    const markInteraction = () => (interacting.current = performance.now());
    map.on('mousedown', markInteraction);
    map.on('touchstart', markInteraction);
    map.on('wheel', markInteraction);
    map.on('dragstart', markInteraction);

    map.on('click', (e) => {
      markInteraction();
      const cur = latest.current;
      if (cur.picking) {
        cur.onPick(e.lngLat.wrap().lng, e.lngLat.lat);
        return;
      }
      const hits = map.queryRenderedFeatures(e.point, { layers: ['poi-pins', 'place-pins', 'place-clusters', 'small-countries', 'country-fill'] });
      const top = pickTop(map, e.point, hits);
      if (!top) return cur.onBackground();
      const layer = top.layer.id;
      if (layer === 'poi-pins') return cur.onPoi(String(top.properties.id), top.properties.kind as 'stay' | 'booking');
      if (layer === 'place-pins') return cur.onCity(String(top.properties.id));
      if (layer === 'place-clusters') {
        const src = map.getSource('places') as GeoJSONSource;
        src.getClusterExpansionZoom(top.properties.cluster_id as number).then((z) => {
          const g = top.geometry as GeoJSON.Point;
          map.easeTo({ center: g.coordinates as [number, number], zoom: z + 0.3, duration: 600 });
        }, () => undefined);
        return;
      }
      cur.onCountry(String(top.properties.id));
    });
    const pointer = (on: boolean) => () => (map.getCanvas().style.cursor = on ? 'pointer' : latest.current.picking ? 'crosshair' : '');
    for (const l of ['place-pins', 'place-clusters', 'small-countries']) {
      map.on('mouseenter', l, pointer(true));
      map.on('mouseleave', l, pointer(false));
    }

    // Gentle rotation of the globe while nobody touches it.
    let raf = 0;
    let last = performance.now();
    const spin = (t: number) => {
      raf = requestAnimationFrame(spin);
      const dt = Math.min(64, t - last);
      last = t;
      const cur = latest.current;
      if (!cur.active || !cur.globe || cur.lite || cur.picking || document.hidden) return;
      if (t - interacting.current < 5000 || map.isMoving() || map.getZoom() > 2.6) return;
      const c = map.getCenter();
      map.jumpTo({ center: [c.lng + dt * 0.0035, c.lat] });
    };
    raf = requestAnimationFrame(spin);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      map.getCanvas().removeEventListener('webglcontextlost', lose);
      map.remove();
      mapRef.current = null;
      loaded.current = false;
    };
  }, []);

  function syncStates(force = false) {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    const next = latest.current.countryStatus;
    const prev = applied.current;
    for (const src of ['countries', 'small']) {
      for (const [id] of prev) if (!next.has(id) || force) map.setFeatureState({ source: src, id }, { status: 'none' });
      for (const [id, s] of next) if (prev.get(id) !== s || force) map.setFeatureState({ source: src, id }, { status: s });
    }
    applied.current = new Map(next);
  }

  function syncSelection() {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    map.setFilter('country-selected', ['==', ['get', 'id'], latest.current.selectedCountry ?? '__none__']);
    map.setFilter('place-halo', ['==', ['get', 'id'], latest.current.selectedCity ?? '__none__']);
  }

  const syncFocus = () => {
    const map = mapRef.current;
    if (!map || !loaded.current) return;
    const p = latest.current.focusPoint;
    (map.getSource('focus') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: p ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }] : [],
    });
  };
  useEffect(syncFocus, [props.focusPoint?.[0], props.focusPoint?.[1]]);
  useEffect(syncStates, [props.countryStatus]);
  useEffect(syncSelection, [props.selectedCity, props.selectedCountry]);
  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded.current) (map.getSource('places') as GeoJSONSource).setData(props.places);
  }, [props.places]);
  useEffect(() => {
    const map = mapRef.current;
    if (map && loaded.current) (map.getSource('pois') as GeoJSONSource).setData(props.pois);
  }, [props.pois]);

  // ---- projection switch
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.setProjection({ type: props.globe ? 'globe' : 'mercator' });
      if (props.globe && map.getZoom() > 3.5) map.easeTo({ zoom: 2.2, duration: 900 });
      if (!props.globe && map.getZoom() < 1.2) map.easeTo({ zoom: 1.4, duration: 600 });
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [props.globe]);

  // ---- lite mode, theme
  useEffect(() => {
    const restyle = () => {
      const map = mapRef.current;
      if (!map || !loaded.current) return;
      const p = readPalette();
      palette.current = p;
      for (const layer of countryLayers(p)) {
        const paint = (layer as { paint?: Record<string, unknown> }).paint ?? {};
        for (const [k, v] of Object.entries(paint)) map.setPaintProperty(layer.id, k, v as never);
      }
      map.setSky(sky(p, latest.current.lite));
      if (map.getSource('ofm')) for (const l of detailLayers(p)) for (const [k, v] of Object.entries(l.paint ?? {})) map.setPaintProperty(l.id, k, v as never);
      resetMarkerImages(map);
      map.triggerRepaint();
    };
    const map = mapRef.current;
    if (map && !loaded.current) map.once('load', restyle);
    else restyle();
    window.addEventListener('myworld-theme', restyle);
    return () => window.removeEventListener('myworld-theme', restyle);
  }, [props.lite]);

  // ---- online detail layers
  useEffect(() => {
    let cancelled = false;
    const map = mapRef.current;
    if (!map) return;
    const remove = () => {
      for (const l of detailLayers(readPalette())) if (map.getLayer(l.id)) map.removeLayer(l.id);
      if (map.getSource('ofm')) map.removeSource('ofm');
    };
    const add = async () => {
      if (!props.detail || props.lite) {
        remove();
        latest.current.onDetail('off');
        return;
      }
      const ok = await detailReachable();
      if (cancelled) return;
      if (!ok) {
        latest.current.onDetail('unavailable');
        return;
      }
      const go = () => {
        if (cancelled || map.getSource('ofm')) return;
        map.setGlyphs(OFM_GLYPHS);
        map.addSource('ofm', { type: 'vector', url: OFM_TILES, attribution: OFM_ATTRIBUTION });
        for (const l of detailLayers(palette.current ?? readPalette())) map.addLayer(l, l.id === 'ofm-water' || l.id === 'ofm-roads' ? 'country-line' : 'place-halo');
        latest.current.onDetail('on');
      };
      if (loaded.current) go();
      else map.once('load', go);
    };
    add();
    return () => {
      cancelled = true;
    };
  }, [props.detail, props.lite]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.getCanvas().style.cursor = props.picking ? 'crosshair' : '';
  }, [props.picking]);

  useEffect(() => {
    if (props.active) mapRef.current?.resize();
  }, [props.active]);

  return <div ref={box} className="map-canvas" aria-label="Карта мира" role="application" />;
});

/** Whole globe visible on a phone, Europe-and-around on wide screens. */
function initialZoom(el: HTMLElement, globe: boolean): number {
  const w = Math.min(el.clientWidth || 390, el.clientHeight || 800);
  // A globe at zoom z is about 512·2^z/π px across.
  const fit = Math.log2((w * 0.92 * Math.PI) / 512);
  return globe ? Math.max(0.3, Math.min(2.0, fit)) : Math.max(0.6, Math.min(1.6, fit + 0.6));
}

/** On a tap, prefer pins over clusters over countries; on touch screens look a few pixels around the finger. */
function pickTop(map: MlMap, point: maplibregl.Point, hits: MapGeoJSONFeature[]): MapGeoJSONFeature | undefined {
  const order = ['poi-pins', 'place-pins', 'place-clusters', 'small-countries', 'country-fill'];
  const best = (list: MapGeoJSONFeature[]) => [...list].sort((a, b) => order.indexOf(a.layer.id) - order.indexOf(b.layer.id))[0];
  const near = map.queryRenderedFeatures(
    [
      [point.x - 14, point.y - 14],
      [point.x + 14, point.y + 6],
    ],
    { layers: ['poi-pins', 'place-pins', 'place-clusters', 'small-countries'] },
  );
  return best(near) ?? best(hits);
}
