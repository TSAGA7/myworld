import type { ExpressionSpecification, LayerSpecification, SkySpecification, StyleSpecification } from 'maplibre-gl';

/** Colors read from the CSS tokens, so the map follows the theme. */
export interface MapPalette {
  ocean: string;
  land: string;
  border: string;
  visited: string;
  visitedLine: string;
  planned: string;
  ink: string;
  dark: boolean;
}

export const readPalette = (): MapPalette => {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  return {
    ocean: v('--map-ocean'),
    land: v('--map-land'),
    border: v('--map-border'),
    visited: v('--map-visited'),
    visitedLine: v('--map-visited-line'),
    planned: v('--map-planned'),
    ink: v('--ink'),
    dark: document.documentElement.dataset.theme === 'dark',
  };
};

const statusIs = (s: string): ExpressionSpecification => ['==', ['feature-state', 'status'], s];

export const landColor = (p: MapPalette): ExpressionSpecification => [
  'case',
  statusIs('visited'), p.visited,
  statusIs('planned'), p.dark ? '#3a3a42' : '#e2e1e6',
  p.land,
];

export function countryLayers(p: MapPalette): LayerSpecification[] {
  return [
    { id: 'ocean', type: 'background', paint: { 'background-color': p.ocean } },
    {
      id: 'country-fill',
      type: 'fill',
      source: 'countries',
      paint: { 'fill-color': landColor(p), 'fill-color-transition': { duration: 600 }, 'fill-antialias': true },
    },
    {
      id: 'country-planned',
      type: 'line',
      source: 'countries',
      filter: ['!=', ['get', 'id'], ''],
      paint: {
        'line-color': p.planned,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1, 6, 2.2],
        'line-dasharray': [2, 1.5],
        'line-opacity': ['case', statusIs('planned'), 0.85, 0],
      },
    },
    {
      id: 'country-line',
      type: 'line',
      source: 'countries',
      paint: {
        'line-color': ['case', statusIs('visited'), p.visitedLine, p.border],
        'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 4, 0.9, 8, 1.4],
      },
    },
    {
      id: 'country-selected',
      type: 'line',
      source: 'countries',
      filter: ['==', ['get', 'id'], '__none__'],
      paint: { 'line-color': p.ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.6, 6, 3] },
    },
    {
      // Microstates are a few pixels wide at world zoom: a dot keeps them visible and tappable.
      id: 'small-countries',
      type: 'circle',
      source: 'small',
      maxzoom: 5,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 2.5, 4, 5],
        'circle-color': ['case', statusIs('visited'), p.visited, statusIs('planned'), p.dark ? '#3a3a42' : '#e2e1e6', p.land],
        'circle-stroke-color': ['case', statusIs('visited'), p.visitedLine, statusIs('planned'), p.planned, p.border],
        'circle-stroke-width': 1,
      },
    },
  ];
}

export const placeLayers = (): LayerSpecification[] => [
  {
    // A searched city that is not on the map yet: a ring shows where it is.
    id: 'focus-ring',
    type: 'circle',
    source: 'focus',
    paint: { 'circle-radius': 9, 'circle-color': '#ddf36f', 'circle-stroke-color': '#232327', 'circle-stroke-width': 2.5 },
  },
  {
    id: 'place-halo',
    type: 'circle',
    source: 'places',
    filter: ['==', ['get', 'id'], '__none__'],
    paint: { 'circle-radius': 26, 'circle-color': 'rgba(221,243,111,0.45)', 'circle-blur': 0.4, 'circle-translate': [0, -18] },
  },
  {
    id: 'place-clusters',
    type: 'symbol',
    source: 'places',
    filter: ['has', 'point_count'],
    layout: {
      'icon-image': ['concat', 'cluster-', ['case', ['all', ['>', ['get', 'visited'], 0], ['>', ['get', 'planned'], 0]], 'mix', ['>', ['get', 'visited'], 0], 'v', 'p'], '-', ['to-string', ['min', ['get', 'point_count'], 99]]],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  },
  {
    id: 'place-pins',
    type: 'symbol',
    source: 'places',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['concat', 'pin-', ['get', 'status'], ['case', ['>', ['get', 'trips'], 1], '-multi', '']],
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'symbol-sort-key': ['case', ['==', ['get', 'status'], 'visited'], 1, 0],
    },
  },
];

export const sky = (p: MapPalette, lite: boolean): SkySpecification =>
  p.dark
    ? { 'sky-color': '#0d0d10', 'horizon-color': '#2a2d22', 'fog-color': '#0d0d10', 'atmosphere-blend': lite ? 0 : ['interpolate', ['linear'], ['zoom'], 0, 0.9, 5, 0.3, 7, 0] }
    : { 'sky-color': '#e6e5e8', 'horizon-color': '#ffffff', 'fog-color': '#e6e5e8', 'atmosphere-blend': lite ? 0 : ['interpolate', ['linear'], ['zoom'], 0, 0.85, 5, 0.3, 7, 0] };

export function baseStyle(p: MapPalette, globe: boolean, lite: boolean, countriesUrl: string): StyleSpecification {
  return {
    version: 8,
    projection: { type: globe ? 'globe' : 'mercator' },
    sky: sky(p, lite),
    sources: {
      countries: { type: 'geojson', data: countriesUrl, promoteId: 'id', attribution: 'Natural Earth' },
      small: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' },
      focus: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      places: {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterRadius: 38,
        clusterMaxZoom: 4,
        clusterProperties: {
          visited: ['+', ['case', ['==', ['get', 'status'], 'visited'], 1, 0]],
          planned: ['+', ['case', ['==', ['get', 'status'], 'planned'], 1, 0]],
        },
      },
    },
    layers: [...countryLayers(p), ...placeLayers()],
  };
}

// ---------------------------------------------------------------- online detail (OpenFreeMap)

export const OFM_TILES = 'https://tiles.openfreemap.org/planet';
export const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const OFM_ATTRIBUTION = '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
const FONT = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:ru'], ['get', 'name:latin'], ['get', 'name']];

/** Lakes, roads and Russian place labels from OpenStreetMap, drawn under our pins. Only added after a reachability check. */
export function detailLayers(p: MapPalette): LayerSpecification[] {
  const label = p.dark ? '#d8d8de' : '#3b3b42';
  const haloC = p.dark ? '#1b1b1f' : '#f4f3f6';
  return [
    { id: 'ofm-water', type: 'fill', source: 'ofm', 'source-layer': 'water', minzoom: 4, paint: { 'fill-color': p.ocean } },
    {
      id: 'ofm-roads',
      type: 'line',
      source: 'ofm',
      'source-layer': 'transportation',
      minzoom: 5,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false],
      paint: { 'line-color': p.dark ? '#3b3b44' : '#d4d3d9', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 2] },
    },
    {
      id: 'ofm-country-labels',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'place',
      maxzoom: 6,
      filter: ['==', ['get', 'class'], 'country'],
      layout: { 'text-field': NAME, 'text-font': FONT_BOLD, 'text-size': ['interpolate', ['linear'], ['zoom'], 2, 10, 5, 14], 'text-max-width': 7 },
      paint: { 'text-color': label, 'text-halo-color': haloC, 'text-halo-width': 1.4, 'text-opacity': 0.75 },
    },
    {
      id: 'ofm-city-labels',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'place',
      minzoom: 4,
      filter: ['match', ['get', 'class'], ['city', 'town'], true, false],
      layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': ['interpolate', ['linear'], ['zoom'], 4, 10, 10, 14], 'text-max-width': 8 },
      paint: { 'text-color': label, 'text-halo-color': haloC, 'text-halo-width': 1.2 },
    },
  ];
}

/** True when the detail tiles and the label font answer: never adds layers that would fail. */
export async function detailReachable(): Promise<boolean> {
  if (!navigator.onLine) return false;
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 5000);
    const [tiles, glyph] = await Promise.all([
      fetch(OFM_TILES, { signal: ctrl.signal }),
      fetch(OFM_GLYPHS.replace('{fontstack}', encodeURIComponent(FONT[0] as string)).replace('{range}', '0-255'), { signal: ctrl.signal }),
    ]);
    window.clearTimeout(t);
    return tiles.ok && glyph.ok;
  } catch {
    return false;
  }
}
