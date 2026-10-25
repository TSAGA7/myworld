import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { deriveWorld } from '../domain/world';
import { BOARDING_DEFAULTS } from '../domain/model';
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
  const trip = await store.saveTrip({ title: 'Италия и Швейцария', startDate: '2026-09-10', endDate: '2026-09-20', countryIds: [], note: '', coverId: null, favorite: false, members: [], dailyBudget: null, dailyBudgetCurrency: '' });
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
      arriveDate: null, arriveTime: null, confirmation: '', price: null, currency: '', url: '', note: '', ...BOARDING_DEFAULTS,
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

import Dexie from 'dexie';
import { createShortCode, openShortCode } from './shortLink';
import { decodeBundle, encodeBundle, importBundle, packTrip, previewMerge, readTripFile, tripFile } from './shareTrip';

describe('schema v2 and shared trips', () => {
  it('upgrades a v1 database without losing data', async () => {
    const name = `v1-${n}`;
    const old = new Dexie(name);
    old.version(1).stores({ trips: 'id, startDate', bookings: 'id, tripId', meta: 'key' });
    await old.table('trips').add({ id: 't1', title: 'Старая', startDate: null, endDate: null, countryIds: [], note: '', coverId: null, createdAt: 'x', updatedAt: 'x' });
    await old.table('bookings').add({ id: 'b1', tripId: 't1', kind: 'tour', title: 'Экскурсия' });
    old.close();
    const upgraded = new WorldDb(name);
    const t = await upgraded.trips.get('t1');
    expect(t?.title).toBe('Старая');
    expect(t?.members).toEqual([]);
    expect((await upgraded.bookings.get('b1'))?.lat).toBeNull();
    expect(await upgraded.expenses.count()).toBe(0);
  });

  it('sends a trip by link and merges changes back', async () => {
    const trip = await makeTrip();
    await store.saveExpense({ tripId: trip.id, date: '2026-09-11', category: 'food', amount: 1200, currency: 'RUB', note: 'Ужин', paidBy: 'me', splitWith: [] });
    const code = await encodeBundle(await packTrip(db, trip.id, 'Андрей'));
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);

    const friend = new WorldDb(`friend-${n}`);
    const bundle = await decodeBundle(code);
    expect(await previewMerge(friend, bundle)).toMatchObject({ isNew: true, added: 4 });
    await importBundle(friend, bundle);
    expect(await friend.stops.count()).toBe(3);
    expect((await friend.cities.get('ne:2'))?.name).toBe('Флоренция');

    // The friend edits an expense; the owner imports it back: newer record wins, nothing is duplicated.
    const e = (await friend.expenses.toArray())[0]!;
    await friend.expenses.put({ ...e, amount: 1500, updatedAt: '2026-10-12T00:00:00.000Z' });
    await importBundle(db, await decodeBundle(await encodeBundle(await packTrip(friend, trip.id, 'Друг'))));
    const mine = await db.expenses.toArray();
    expect(mine).toHaveLength(1);
    expect(mine[0]?.amount).toBe(1500);
    await expect(decodeBundle('мусор')).rejects.toThrow();
  });

  it('moves a whole trip with its cover and documents to another device by file', async () => {
    const trip = await makeTrip();
    const cover = await store.addAttachment(trip.id, 'cover', trip.id, { name: 'cover.jpg', blob: new Blob([new Uint8Array([1, 2, 3, 250])], { type: 'image/jpeg' }) });
    await store.addAttachment(trip.id, 'trip', trip.id, { name: 'visa.pdf', blob: new Blob(['%PDF-1.4 виза'], { type: 'application/pdf' }) });
    const file = await tripFile(db, trip.id, 'Андрей');
    expect(file.name).toBe('Италия и Швейцария.myworld.json');

    const other = new WorldDb(`device-${n}`);
    const bundle = await readTripFile(file);
    expect(bundle.files).toHaveLength(2);
    await importBundle(other, bundle);
    const got = await other.trips.get(trip.id);
    expect(got?.coverId).toBe(cover.id);
    expect(await other.stops.count()).toBe(3);
    const blob = (await other.blobs.get(cover.id))?.blob;
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 250]));
    expect(await other.attachments.count()).toBe(2);
    // Importing the same file again changes nothing.
    await importBundle(other, await readTripFile(file));
    expect(await other.attachments.count()).toBe(2);
    // A share link stays light: no files.
    expect((await decodeBundle(await encodeBundle(await packTrip(db, trip.id, '')))).files).toHaveLength(0);
    await expect(readTripFile(new File(['{"app":"myworld"}'], 'x.json'))).rejects.toThrow(/резервная копия/);
  });

  it('makes a short encrypted link and opens it', async () => {
    const trip = await makeTrip();
    const kept = new Map<string, string>();
    const fake = (async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        kept.set('abc123def', String(init.body));
        return new Response('', { status: 201, headers: { Location: 'https://jsonblob.com/api/jsonBlob/abc123def' } });
      }
      const id = String(url).split('/').pop() ?? '';
      return kept.has(id) ? new Response(kept.get(id), { status: 200 }) : new Response('', { status: 404 });
    }) as typeof fetch;
    const code = await createShortCode(await packTrip(db, trip.id, 'Андрей'), fake);
    expect(code.length).toBeLessThan(40);
    // The store holds only ciphertext: no trip title, no city names.
    expect(kept.get('abc123def')).not.toMatch(/Италия|Рим/);
    const b = await openShortCode(code, fake);
    expect(b.trip.title).toBe('Италия и Швейцария');
    expect(b.stops).toHaveLength(3);
    await expect(openShortCode(code.replace(/\.[\w-]+$/, '.AAAAAAAAAAAAAAAAAAAAAA'), fake)).rejects.toThrow('повреждена');
    await expect(openShortCode('s/zzzzzzzz.AAAAAAAAAAAAAAAAAAAAAA', fake)).rejects.toThrow('не найдена');
  });

  it('imports places from photos: new visits with dates, earlier dates win, trips with route and linked visits', async () => {
    await store.markCity(ROME, 'visited', '2025-01-01');
    await store.markCountry('IT', 'visited', null);
    const r = await store.importPhotoPlaces({
      places: [
        { city: null, countryId: 'IT', date: '2019-05-01' },
        { city: ROME, countryId: 'IT', date: '2019-05-01' },
        { city: FLORENCE, countryId: 'IT', date: '2019-05-03' },
        { city: null, countryId: 'CH', date: '2019-05-06' },
        { city: ZURICH, countryId: 'CH', date: '2019-05-06' },
      ],
      trips: [
        { title: 'Италия и Швейцария, май 2019', start: '2019-05-01', end: '2019-05-06', countryIds: ['IT', 'CH'], stops: [
          { city: ROME, startDate: '2019-05-01', endDate: '2019-05-02' },
          { city: FLORENCE, startDate: '2019-05-03', endDate: '2019-05-03' },
          { city: ZURICH, startDate: '2019-05-06', endDate: '2019-05-06' },
        ] },
      ],
    });
    expect(r).toEqual({ countries: 1, cities: 2, trips: 1 });
    const visits = await db.visits.toArray();
    expect(visits).toHaveLength(5); // IT, Rome, Florence, CH, Zurich — no duplicates
    const byKey = new Map(visits.map((v) => [v.cityId ?? v.countryId, v]));
    expect(byKey.get('ne:1')?.date).toBe('2019-05-01'); // earlier photo replaced 2025
    expect(byKey.get('IT')?.date).toBe('2019-05-01'); // had no date
    const [trip] = await db.trips.toArray();
    expect(trip).toMatchObject({ title: 'Италия и Швейцария, май 2019', startDate: '2019-05-01', endDate: '2019-05-06', countryIds: ['IT', 'CH'] });
    expect((await db.stops.where('tripId').equals(trip!.id).sortBy('order')).map((s) => s.cityId)).toEqual(['ne:1', 'ne:2', 'ne:3']);
    const linked = (await db.visits.toArray()).filter((v) => v.tripIds.includes(trip!.id)).map((v) => v.cityId).sort();
    expect(linked).toEqual(['ne:1', 'ne:2', 'ne:3']);

    // Importing the same photos again changes nothing.
    const again = await store.importPhotoPlaces({ places: [{ city: ROME, countryId: 'IT', date: '2020-01-01' }], trips: [] });
    expect(again).toEqual({ countries: 0, cities: 0, trips: 0 });
    expect((await db.visits.where('cityId').equals('ne:1').first())?.date).toBe('2019-05-01');
    expect((await world()).visitedCountryIds.has('CH')).toBe(true);
  });
});
