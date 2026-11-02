import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { exportBackup, parseBackup, restoreBackup } from '../data/backup';
import { SCHEMA_VERSION, WorldDb } from '../data/db';
import { WorldStore } from '../data/store';
import { deriveWorld } from './world';
import {
  groupByCountry,
  hobbyProgress,
  indexPlaces,
  placeMatches,
  placeSoundsLike,
  RIDER_JOKE,
  type Resort,
  resortFacts,
  resortsFileSchema,
  type Spot,
  spotsFileSchema,
  visitedIn,
  worldScopes,
} from './hobby';

const resort = (id: string, name: string, countryId: string, extra: Partial<Resort> = {}): Resort =>
  resortsFileSchema.parse({ generatedAt: 'x', items: [{ id, name, countryId, lat: 1, lon: 2, ...extra }] }).items[0] as Resort;
const spot = (id: string, name: string, countryId: string, group: string, extra: Partial<Spot> = {}): Spot =>
  spotsFileSchema.parse({ generatedAt: 'x', items: [{ id, name, countryId, group, lat: 1, lon: 2, ...extra }] }).items[0] as Spot;
const name = (id: string) => ({ RU: 'Россия', FR: 'Франция', ID: 'Индонезия', CH: 'Швейцария' })[id] ?? id;

let n = 0;
const fresh = () => {
  const db = new WorldDb(`hobby-${++n}`);
  return { db, store: new WorldStore(db, () => '2026-11-01T00:00:00.000Z', () => `id-${n}-${Math.random().toString(36).slice(2)}`) };
};

describe('hobbies', () => {
  it('shows the hobby tabs only for the hobbies that are on, in any allowed combination', () => {
    expect(worldScopes({ rider: null, surf: false })).toEqual(['world', 'home']);
    expect(worldScopes({ rider: 'ski', surf: false })).toEqual(['world', 'home', 'rider']);
    expect(worldScopes({ rider: 'snowboard', surf: true })).toEqual(['world', 'home', 'rider', 'surf']);
    expect(worldScopes({ rider: null, surf: true })).toEqual(['world', 'home', 'surf']);
    // Skis and snowboard at once cannot even be expressed: rider is one value.
    expect(RIDER_JOKE.ski.text).toContain('центру склона');
    expect(RIDER_JOKE.snowboard.text).toContain('центр трассы');
  });

  it('counts each place once, across old ids, and the denominator is the active catalog', () => {
    const items = [resort('wd-Q1', 'Роза Хутор', 'RU', { alt: ['osm-way-1'] }), resort('wd-Q2', 'Шерегеш', 'RU'), resort('wd-Q3', 'Закрытый', 'RU', { active: false })];
    const idx = indexPlaces(items);
    const v = visitedIn(idx, ['osm-way-1', 'wd-Q1', 'wd-Q3', 'gone']);
    expect([...v]).toEqual(['wd-Q1']);
    expect(hobbyProgress(items, v)).toEqual({ visited: 1, total: 2, percent: 50 });
  });

  it('searches by name, Russian name, country and region; groups spots by island', () => {
    const r = resort('wd-Q9', 'Courchevel', 'FR', { nameRu: 'Куршевель', region: 'Овернь — Рона — Альпы' });
    expect(placeMatches(r, 'куршев', name)).toBe(true);
    expect(placeMatches(r, 'франц', name)).toBe(true);
    expect(placeMatches(r, 'рона', name)).toBe(true);
    expect(placeMatches(r, 'церматт', name)).toBe(false);
    // By sound, whatever the spelling; by the mountains and the town next to the slopes.
    const plain = resort('x', 'Courchevel', 'FR');
    expect(placeMatches(plain, 'Куршавель', name)).toBe(false);
    expect(placeSoundsLike(plain, 'Куршавель')).toBe(true);
    expect(placeSoundsLike(plain, 'куршев')).toBe(true);
    expect(placeSoundsLike(resort('z', 'Zermatt - Breuil-Cervinia', 'CH'), 'Церматт')).toBe(true);
    expect(placeSoundsLike(resort('k', 'Kitzbühel', 'AT'), 'Кицбюэль')).toBe(true);
    expect(placeSoundsLike(resort('i', 'Ischgl', 'AT'), 'Ишгль')).toBe(true);
    expect(placeSoundsLike(plain, 'Шамони')).toBe(false);
    expect(placeSoundsLike(plain, 'ку')).toBe(false);
    const bw = resort('b', 'Большой Вудъявр', 'RU', { aliases: ['Хибины'], towns: ['Кировск'] });
    expect(placeMatches(bw, 'кировск', name)).toBe(true);
    expect(placeMatches(bw, 'хибины', name)).toBe(true);
    const spots = [spot('id-uluwatu', 'Uluwatu', 'ID', 'Бали'), spot('id-g-land', 'G-Land', 'ID', 'Ява'), spot('id-canggu', 'Canggu', 'ID', 'Бали')];
    const [g] = groupByCountry(spots, new Set(['id-canggu']), name);
    expect(g?.visited).toBe(1);
    expect(g?.sub.map((s) => [s.name, s.items.length])).toEqual([
      ['Бали', 2],
      ['Ява', 1],
    ]);
  });

  it('hides unknown resort facts instead of inventing them', () => {
    expect(resortFacts(resort('a', 'A', 'CH'))).toEqual([]);
    expect(resortFacts(resort('b', 'B', 'CH', { pisteKm: 360, lifts: 52, elevMin: 1620, elevMax: 3883 }))).toEqual([
      { label: 'трасс', value: '360 км' },
      { label: 'подъёмников', value: '52' },
      { label: 'высота катания', value: '1620–3883 м' },
    ]);
  });
});

describe('hobby marks in the database', () => {
  it('marks a resort once, under any of its ids, marks the new country and keeps history when the hobby is off', async () => {
    const { db, store } = fresh();
    await store.setSetting('riderType', 'ski');
    // First marked when the catalog knew the resort only by its OSM id; later it gained a Wikidata id.
    const r1 = await store.markHobby('visit', 'resort', ['osm-way-1'], 'RU');
    const r2 = await store.markHobby('visit', 'resort', ['wd-Q1', 'osm-way-1'], 'RU');
    expect(r1.countryAdded).toBe(true);
    expect(r2.countryAdded).toBe(false);
    expect(await db.hobby.count()).toBe(1);
    expect(deriveWorld(await db.visits.toArray(), [], []).visitedCountryIds.has('RU')).toBe(true);

    // Switching the hobby off is a setting only — the marks stay.
    await store.setSetting('riderType', null);
    expect(await db.hobby.count()).toBe(1);

    const removed = await store.unmarkHobby('visit', 'resort', ['wd-Q1', 'osm-way-1']);
    expect(await db.hobby.count()).toBe(0);
    expect(deriveWorld(await db.visits.toArray(), [], []).visitedCountryIds.has('RU')).toBe(true);
    await store.restoreHobby(removed);
    expect(await db.hobby.count()).toBe(1);
  });

  it('does not touch countries when travel tracking is off (no country passed)', async () => {
    const { db, store } = fresh();
    await store.markHobby('visit', 'spot', ['id-uluwatu'], null);
    expect(await db.visits.count()).toBe(0);
    expect(await db.hobby.count()).toBe(1);
  });

  it('survives a backup round trip, and an older backup without hobbies still restores', async () => {
    const { db, store } = fresh();
    await store.markHobby('visit', 'spot', ['id-uluwatu'], null);
    await store.markHobby('fav', 'spot', ['id-uluwatu'], null);
    const b = await exportBackup(db, false, '2026-11-01T00:00:00Z');
    const other = fresh();
    await restoreBackup(other.db, parseBackup(JSON.parse(JSON.stringify(b))));
    expect((await other.db.hobby.toArray()).map((m) => m.key).sort()).toEqual(['fav:spot:id-uluwatu', 'visit:spot:id-uluwatu']);

    const old = JSON.parse(JSON.stringify({ ...b, schemaVersion: 2 }));
    delete old.tables.hobby;
    await restoreBackup(other.db, parseBackup(old));
    expect(await other.db.hobby.count()).toBe(0);
  });

  it('upgrades a v2 database without losing anything', async () => {
    const name = `upgrade-${++n}`;
    const v2 = new Dexie(name);
    v2.version(1).stores({ cities: 'id, countryId', visits: 'id, &key, cityId, countryId', plans: 'id, &key, cityId, countryId', trips: 'id, startDate', stops: 'id, tripId, cityId', transport: 'id, tripId', stays: 'id, tripId', bookings: 'id, tripId', notes: 'id, tripId', attachments: 'id, tripId, ownerId', blobs: 'id', tasks: 'id, tripId', meta: 'key' });
    v2.version(2).stores({ expenses: 'id, tripId, date', diary: 'id, tripId, date', guides: 'id, tripId', geocode: 'q' });
    await v2.open();
    await v2.table('visits').add({ id: 'v1', key: 'country:IT', cityId: null, countryId: 'IT', date: null, tripIds: [], manual: true, createdAt: 'x', updatedAt: 'x' });
    v2.close();
    const db = new WorldDb(name);
    await db.open();
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect(await db.visits.count()).toBe(1);
    expect(await db.hobby.count()).toBe(0);
    db.close();
  });
});

import { resortWatch } from './hobby';
describe('«Сейчас тут»', () => {
  const idx = new Map([
    ['r1', { id: 'r1' }],
    ['old-r2', { id: 'r2' }],
    ['r2', { id: 'r2' }],
    ['r3', { id: 'r3' }],
  ]);
  const now = new Date('2026-12-10T12:00:00Z');
  const m = (what: string, placeId: string, until: string | null = null) => ({ what, kind: 'resort', placeId, until });
  it('turns notices on while here, off when muted or expired; manual notices work without being here', () => {
    const w = resortWatch([m('here', 'r1', '2026-12-15T00:00:00Z'), m('here', 'old-r2', '2026-12-01T00:00:00Z'), m('notify', 'r3'), m('here', 'r3', '2026-12-12T00:00:00Z'), m('mute', 'r3')], idx, now);
    expect([...w.here].sort()).toEqual(['r1', 'r3']);
    expect(w.expired).toEqual(['r2']);
    expect([...w.notify].sort()).toEqual(['r1', 'r3']);
    expect(resortWatch([m('here', 'r1', '2026-12-15T00:00:00Z'), m('mute', 'r1')], idx, now).notify.size).toBe(0);
  });
});
