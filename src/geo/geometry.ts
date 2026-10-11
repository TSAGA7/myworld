import { geoBounds, geoContains, geoDistance } from 'd3-geo';
import { COUNTRY_BY_ID, loadStatic } from './reference';

export type CountryFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string }>;
export type CountryShapes = GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string }>;

/** Country polygons (Natural Earth 1:50m), shared by the map, the fallback map and the route maps. */
export const loadCountryShapes = (): Promise<CountryShapes> => loadStatic<CountryShapes>('data/countries.geojson');

/** Country containing a point; when the point is at sea, the nearest country label within ~300 km. */
export async function countryAt(lon: number, lat: number): Promise<string | null> {
  const shapes = await loadCountryShapes();
  const p: [number, number] = [lon, lat];
  for (const f of shapes.features) {
    const [[w, s], [e, n]] = geoBounds(f);
    const inLon = w <= e ? lon >= w - 0.5 && lon <= e + 0.5 : lon >= w - 0.5 || lon <= e + 0.5;
    if (!inLon || lat < s - 0.5 || lat > n + 0.5) continue;
    if (geoContains(f, p)) return f.properties.id;
  }
  let best: string | null = null;
  let bestD = 0.05; // radians ≈ 320 km
  for (const [id, c] of COUNTRY_BY_ID) {
    const d = geoDistance(p, c.label);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
