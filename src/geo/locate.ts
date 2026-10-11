import { db } from '../app/world';
import { geocode } from './online';

/**
 * Finds an address on the map (OpenStreetMap) and stores the point on the stay or booking, so it appears as a flag
 * on the maps and in route links. Runs after saving: the form never waits for the network.
 */
export async function locateAddress(table: 'stays' | 'bookings', id: string, address: string, cityName: string): Promise<'found' | 'missing' | 'offline'> {
  const a = address.trim();
  if (!a) return 'missing';
  if (!navigator.onLine) return 'offline';
  const withCity = cityName && !a.toLowerCase().includes(cityName.toLowerCase()) ? `${a}, ${cityName}` : a;
  try {
    const hit = (await geocode(withCity)) ?? (withCity !== a ? await geocode(a) : null);
    if (!hit) return 'missing';
    await db[table].update(id, { lat: hit.lat, lon: hit.lon });
    return 'found';
  } catch {
    return 'offline';
  }
}
