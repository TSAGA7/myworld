import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deriveWorld } from '../domain/world';
import { exportBackup, parseBackup, restoreBackup } from './backup';
import { WorldDb } from './db';
import { type CityInput, WorldStore } from './store';

const city = (id: string, name: string, countryId: string, lat = 41.9, lon = 12.5): CityInput => ({
  id, name, nameEn: '', countryId, lat, lon, region: '', source: 'catalog',
});
const ROME = city('ne:1', 'Рим', 'IT');
const FLORENCE = city('ne:2', 'Флоренция', 'IT', 43.77, 11.25);
const ZURICH = city('ne:3', 'Цюрих', 'CH', 47.37, 8.54);

let db: WorldDb;
let store: WorldStore;
let n = 0;

beforeEach(async () => {
  db = new WorldDb(`test-${++n}`);
  store = new WorldStore(db, () => '2026-10-11T00:00:00.000Z', () => `id-${n}-${Math.random().toString(36).slice(2)}`);
});

async function world() {
  return deriveWorld(await db.visits.toArray(), await db.plans.toArray(), await db.stops.toArray());
}

async function makeTrip() {
  const trip = await store.saveTrip({ title: 'Италия и Швейцария', startDate: '2026-09-10', endDate: '2026-09-20', countryIds: [], note: '', coverId: null });
  await store.saveRoute(trip.id, [
    { city: ROME, startDate: '2026-09-10', endDate: '2026-09-13', note: '' },
    { city: FLORENCE, startDate: '2026-09-13', endDate: '2026-09-16', note: '' },
    { city: ZURICH, startDate: null, endDate: null, note: '' },
  ]);
  return trip;
}

describe('WorldStore', () => {
  it('marks a city once however many times it is pressed, and undo restores an unmark', async () => {
    await store.markCity(ROME, 'visited', '2019-05-01');
    await store.markCity(ROME, 'visited');
    expect(await db.visits.count()).toBe(1);
    expect((await db.visits.toArray())[0]?.date).toBe('2019-05-01');
    const undo = await store.unmarkCity(ROME.id, 'all');
    expect((await world()).visitedCityIds.size).toBe(0);
    await store.undo(undo);
    expect((await world()).visitedCityIds.has(ROME.id)).toBe(true);
  });

  it('keeps trip countries in sync with the route', async () => {
    const trip = await makeTrip();
    expect((await db.trips.get(trip.id))?.countryIds).toEqual(['IT', 'CH']);
    expect((await db.stops.where('tripId').equals(trip.id).sortBy('order')).map((s) => s.cityId)).toEqual(['ne:1', 'ne:2', 'ne:3']);
  });

  it('adds trip cities to the map as planned, idempotently', async () => {
    const trip = await makeTrip();
    const first = await store.addTripToMap(trip.id);
    expect(first).toMatchObject({ added: 3, already: 0 });
    const second = await store.addTripToMap(trip.id);
    expect(second).toMatchObject({ added: 0, already: 3, changed: 0 });
    expect(await db.plans.count()).toBe(3);
    const w = await world();
    expect(w.plannedCityIds.size).toBe(3);
    expect(w.visitedCityIds.size).toBe(0);
    expect(w.countryStatus.get('IT')).toBe('planned');
  });

  it('marks selected cities visited and updates statistics', async () => {
    const trip = await makeTrip();
    await store.addTripToMap(trip.id);
    await store.markCity(FLORENCE, 'visited', '2015-04-04');
    const res = await store.markTripVisited(trip.id, new Set(['city:ne:1', 'city:ne:2']), new Set());
    expect(res).toEqual({ created: 1, updated: 1 });
    expect(await db.visits.count()).toBe(2);
    expect((await db.visits.where('key').equals('city:ne:2').first())?.date).toBe('2015-04-04');
    const again = await store.markTripVisited(trip.id, new Set(['city:ne:1', 'city:ne:2']), new Set());
    expect(again).toEqual({ created: 0, updated: 0 });
    const w = await world();
    expect([...w.visitedCountryIds]).toEqual(['IT']);
    expect(w.cityStatus.get('ne:3')).toBe('planned');
  });

  it('deletes a trip with its records but keeps confirmed visits', async () => {
    const trip = await makeTrip();
    await store.addTripToMap(trip.id);
    await store.markTripVisited(trip.id, new Set(['city:ne:1']), new Set());
    await store.saveTransport({
      tripId: trip.id, mode: 'flight', carrier: 'X', number: '', from: 'MOW', to: 'ROM', departDate: null, departTime: null,
      arriveDate: null, arriveTime: null, confirmation: '', price: null, currency: '', url: '', note: '',
    });
    await store.saveTask({ tripId: trip.id, title: 'Купить билеты', done: false, order: 0 });
    await store.deleteTrip(trip.id);
    expect(await db.trips.count()).toBe(0);
    expect(await db.stops.count()).toBe(0);
    expect(await db.transport.count()).toBe(0);
    expect(await db.tasks.count()).toBe(0);
    expect(await db.plans.count()).toBe(0);
    const visits = await db.visits.toArray();
    expect(visits).toHaveLength(1);
    expect(visits[0]?.tripIds).toEqual([]);
  });

  it('round-trips a backup', async () => {
    const trip = await makeTrip();
    await store.addTripToMap(trip.id);
    await store.markCountry('JP', 'visited', '2010-01-01');
    const backup = parseBackup(JSON.parse(JSON.stringify(await exportBackup(db, false, 'now'))));
    const other = new WorldDb(`restore-${n}`);
    await restoreBackup(other, backup);
    expect(await other.trips.count()).toBe(1);
    expect(await other.plans.count()).toBe(3);
    expect((await other.visits.toArray())[0]?.key).toBe('country:JP');
    expect(() => parseBackup({ app: 'fitapp' })).toThrow(/резервную копию/);
  });
});
