import type {
  AccommodationBooking,
  Attachment,
  City,
  GeneralBooking,
  OwnerType,
  PlannedMark,
  TransportBooking,
  Trip,
  TripNote,
  TripStop,
  TripTask,
  Visit,
} from '../domain/model';
import { visitKey } from '../domain/model';
import { type AddPreview, buildAddToMap, buildMarkVisited, previewAddToMap, previewMarkVisited, type VisitPreviewItem } from '../domain/tripToMap';
import { TRIP_TABLES, type WorldDb } from './db';

export type Stamped<T> = Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };
export type CityInput = Omit<City, 'createdAt' | 'updatedAt'>;

/** Snapshot of records removed by an "unmark" action, so the action can be undone. */
export interface Undo {
  visits: Visit[];
  plans: PlannedMark[];
}

const fallbackId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = (Math.random() * 16) | 0;
  return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
});
export const defaultId = (): string => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : fallbackId());

/** All writes of the app. Every multi-record change runs in one IndexedDB transaction. */
export class WorldStore {
  constructor(
    readonly db: WorldDb,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly newId: () => string = defaultId,
  ) {}

  // ---------------------------------------------------------------- places

  /** Saves the city snapshot the user refers to; a catalog city keeps its catalog id, so it is stored once. */
  async ensureCity(input: CityInput): Promise<City> {
    const existing = await this.db.cities.get(input.id);
    const now = this.now();
    if (existing) {
      // A custom city may receive coordinates later; catalog snapshots are left as they are.
      if (existing.source === 'custom' && (existing.lat !== input.lat || existing.lon !== input.lon || existing.name !== input.name)) {
        const next = { ...existing, ...input, createdAt: existing.createdAt, updatedAt: now };
        await this.db.cities.put(next);
        return next;
      }
      return existing;
    }
    const city: City = { ...input, createdAt: now, updatedAt: now };
    await this.db.cities.put(city);
    return city;
  }

  newCustomCityId(): string {
    return `u:${this.newId()}`;
  }

  async updateCity(id: string, patch: Partial<Pick<City, 'name' | 'lat' | 'lon' | 'region'>>): Promise<void> {
    await this.db.cities.update(id, { ...patch, updatedAt: this.now() });
  }

  /** Marks a city visited (with an optional date) or planned. Repeat calls update the same record. */
  async markCity(city: CityInput, status: 'visited' | 'planned', date: string | null = null): Promise<void> {
    await this.db.transaction('rw', this.db.cities, this.db.visits, this.db.plans, async () => {
      await this.ensureCity(city);
      await this.mark(visitKey(city.id, city.countryId), city.id, city.countryId, status, date);
    });
  }

  async markCountry(countryId: string, status: 'visited' | 'planned', date: string | null = null): Promise<void> {
    await this.db.transaction('rw', this.db.visits, this.db.plans, () => this.mark(visitKey(null, countryId), null, countryId, status, date));
  }

  private async mark(key: string, cityId: string | null, countryId: string, status: 'visited' | 'planned', date: string | null): Promise<void> {
    const now = this.now();
    if (status === 'visited') {
      const v = await this.db.visits.where('key').equals(key).first();
      if (v) {
        if (date && date !== v.date) await this.db.visits.put({ ...v, date, manual: true, updatedAt: now });
        return;
      }
      await this.db.visits.add({ id: this.newId(), key, cityId, countryId, date, tripIds: [], manual: true, createdAt: now, updatedAt: now });
      return;
    }
    const p = await this.db.plans.where('key').equals(key).first();
    if (p) {
      if (!p.manual) await this.db.plans.put({ ...p, manual: true, updatedAt: now });
      return;
    }
    await this.db.plans.add({ id: this.newId(), key, cityId, countryId, tripIds: [], manual: true, createdAt: now, updatedAt: now });
  }

  async setVisitDate(key: string, date: string | null): Promise<void> {
    const v = await this.db.visits.where('key').equals(key).first();
    if (v) await this.db.visits.put({ ...v, date, updatedAt: this.now() });
  }

  /**
   * Removes a city from the map ("visited", "planned" or both). The city stays in trips that use it.
   * Returns what was removed so the user can undo.
   */
  async unmarkCity(cityId: string, what: 'visited' | 'planned' | 'all'): Promise<Undo> {
    return this.db.transaction('rw', this.db.visits, this.db.plans, async () => {
      const visits = what === 'planned' ? [] : await this.db.visits.where('cityId').equals(cityId).toArray();
      const plans = what === 'visited' ? [] : await this.db.plans.where('cityId').equals(cityId).toArray();
      await this.db.visits.bulkDelete(visits.map((v) => v.id));
      await this.db.plans.bulkDelete(plans.map((p) => p.id));
      return { visits, plans };
    });
  }

  /** Unmarks a country. With `withCities` the visited/planned cities of the country go too. */
  async unmarkCountry(countryId: string, what: 'visited' | 'planned', withCities: boolean): Promise<Undo> {
    return this.db.transaction('rw', this.db.visits, this.db.plans, async () => {
      const table = what === 'visited' ? this.db.visits : this.db.plans;
      const rows = (await table.where('countryId').equals(countryId).toArray()) as Array<Visit | PlannedMark>;
      const gone = rows.filter((r) => withCities || r.cityId === null);
      await table.bulkDelete(gone.map((r) => r.id));
      return what === 'visited' ? { visits: gone as Visit[], plans: [] } : { visits: [], plans: gone as PlannedMark[] };
    });
  }

  async undo(u: Undo): Promise<void> {
    await this.db.transaction('rw', this.db.visits, this.db.plans, async () => {
      for (const v of u.visits) if (!(await this.db.visits.where('key').equals(v.key).count())) await this.db.visits.put(v);
      for (const p of u.plans) if (!(await this.db.plans.where('key').equals(p.key).count())) await this.db.plans.put(p);
    });
  }

  // ---------------------------------------------------------------- trips

  async saveTrip(input: Stamped<Trip>): Promise<Trip> {
    const now = this.now();
    const prev = input.id ? await this.db.trips.get(input.id) : undefined;
    const trip: Trip = { ...input, id: input.id ?? this.newId(), createdAt: prev?.createdAt ?? now, updatedAt: now } as Trip;
    if (trip.startDate && trip.endDate && trip.endDate < trip.startDate) [trip.startDate, trip.endDate] = [trip.endDate, trip.startDate];
    await this.db.trips.put(trip);
    return trip;
  }

  /** Replaces the route of a trip. Stop ids are kept for cities that stay, so attachments stay linked. */
  async saveRoute(
    tripId: string,
    route: ReadonlyArray<{ id?: string; city: CityInput; startDate: string | null; endDate: string | null; note: string }>,
  ): Promise<void> {
    await this.db.transaction('rw', [this.db.trips, this.db.stops, this.db.cities], async () => {
      const now = this.now();
      const old = await this.db.stops.where('tripId').equals(tripId).toArray();
      const keep = new Set<string>();
      let order = 0;
      for (const r of route) {
        await this.ensureCity(r.city);
        const prev = r.id ? old.find((s) => s.id === r.id) : undefined;
        const stop: TripStop = {
          id: prev?.id ?? this.newId(),
          tripId,
          order: order++,
          cityId: r.city.id,
          countryId: r.city.countryId,
          startDate: r.startDate,
          endDate: r.endDate,
          note: r.note,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
        };
        keep.add(stop.id);
        await this.db.stops.put(stop);
      }
      await this.db.stops.bulkDelete(old.filter((s) => !keep.has(s.id)).map((s) => s.id));
      await this.syncTripCountries(tripId);
    });
  }

  /** Keeps every stop's country in the trip's country list (user order first, new ones appended). */
  async syncTripCountries(tripId: string): Promise<void> {
    const trip = await this.db.trips.get(tripId);
    if (!trip) return;
    const stops = (await this.db.stops.where('tripId').equals(tripId).toArray()).sort((a, b) => a.order - b.order);
    const list = [...trip.countryIds];
    for (const s of stops) if (!list.includes(s.countryId)) list.push(s.countryId);
    if (list.join() !== trip.countryIds.join()) await this.db.trips.put({ ...trip, countryIds: list, updatedAt: this.now() });
  }

  /** Deletes a trip with its route, bookings, notes, tasks and files. Visits stay (they are facts) but lose the link. */
  async deleteTrip(tripId: string): Promise<void> {
    const db = this.db;
    await db.transaction('rw', [db.trips, db.visits, db.plans, db.attachments, db.blobs, ...TRIP_TABLES.map((t) => db[t])], async () => {
      for (const t of TRIP_TABLES) await db[t].where('tripId').equals(tripId).delete();
      const files = await db.attachments.where('tripId').equals(tripId).toArray();
      await db.blobs.bulkDelete(files.map((f) => f.id));
      await db.attachments.bulkDelete(files.map((f) => f.id));
      const now = this.now();
      for (const p of await db.plans.toArray()) {
        if (!p.tripIds.includes(tripId)) continue;
        const tripIds = p.tripIds.filter((x) => x !== tripId);
        if (tripIds.length === 0 && !p.manual) await db.plans.delete(p.id);
        else await db.plans.put({ ...p, tripIds, updatedAt: now });
      }
      for (const v of await db.visits.toArray()) {
        if (v.tripIds.includes(tripId)) await db.visits.put({ ...v, tripIds: v.tripIds.filter((x) => x !== tripId), updatedAt: now });
      }
      await db.trips.delete(tripId);
    });
  }

  // ---------------------------------------------------------------- trip → map

  async previewAddToMap(tripId: string): Promise<AddPreview | null> {
    const trip = await this.db.trips.get(tripId);
    if (!trip) return null;
    const [stops, plans, visits] = await Promise.all([this.db.stops.where('tripId').equals(tripId).toArray(), this.db.plans.toArray(), this.db.visits.toArray()]);
    return previewAddToMap(trip, stops, plans, visits);
  }

  /** "Добавить города на карту": new places become planned; the preview is recomputed inside the transaction. */
  async addTripToMap(tripId: string): Promise<{ added: number; already: number; changed: number }> {
    return this.db.transaction('rw', this.db.trips, this.db.stops, this.db.plans, this.db.visits, async () => {
      const trip = await this.db.trips.get(tripId);
      if (!trip) throw new Error('Поездка не найдена');
      const [stops, plans, visits] = await Promise.all([this.db.stops.where('tripId').equals(tripId).toArray(), this.db.plans.toArray(), this.db.visits.toArray()]);
      const preview = previewAddToMap(trip, stops, plans, visits);
      const ops = buildAddToMap(trip, preview, plans, this.now(), this.newId);
      await this.db.plans.bulkAdd(ops.creates);
      await this.db.plans.bulkPut(ops.updates);
      return { added: preview.added, already: preview.already, changed: ops.creates.length + ops.updates.length };
    });
  }

  async previewMarkVisited(tripId: string): Promise<VisitPreviewItem[]> {
    const trip = await this.db.trips.get(tripId);
    if (!trip) return [];
    const [stops, visits] = await Promise.all([this.db.stops.where('tripId').equals(tripId).toArray(), this.db.visits.toArray()]);
    return previewMarkVisited(trip, stops, visits);
  }

  /** "Отметить города посещёнными" for the places the user selected. */
  async markTripVisited(tripId: string, selected: ReadonlySet<string>, replaceDate: ReadonlySet<string>): Promise<{ created: number; updated: number }> {
    return this.db.transaction('rw', this.db.trips, this.db.stops, this.db.visits, async () => {
      const trip = await this.db.trips.get(tripId);
      if (!trip) throw new Error('Поездка не найдена');
      const [stops, visits] = await Promise.all([this.db.stops.where('tripId').equals(tripId).toArray(), this.db.visits.toArray()]);
      const items = previewMarkVisited(trip, stops, visits);
      const ops = buildMarkVisited(trip, items, selected, replaceDate, this.now(), this.newId);
      await this.db.visits.bulkAdd(ops.creates);
      await this.db.visits.bulkPut(ops.updates);
      return { created: ops.creates.length, updated: ops.updates.length };
    });
  }

  // ---------------------------------------------------------------- trip records

  async saveTransport(r: Stamped<TransportBooking>): Promise<TransportBooking> {
    return this.put<TransportBooking>(this.db.transport, r);
  }
  async saveStay(r: Stamped<AccommodationBooking>): Promise<AccommodationBooking> {
    return this.put<AccommodationBooking>(this.db.stays, r);
  }
  async saveBooking(r: Stamped<GeneralBooking>): Promise<GeneralBooking> {
    return this.put<GeneralBooking>(this.db.bookings, r);
  }
  async saveNote(r: Stamped<TripNote>): Promise<TripNote> {
    return this.put<TripNote>(this.db.notes, r);
  }
  async saveTask(r: Stamped<TripTask>): Promise<TripTask> {
    return this.put<TripTask>(this.db.tasks, r);
  }

  private async put<T extends { id: string; createdAt: string; updatedAt: string }>(
    table: { get(id: string): Promise<T | undefined>; put(v: T): Promise<unknown> },
    r: Stamped<T>,
  ): Promise<T> {
    const now = this.now();
    const prev = r.id ? await table.get(r.id) : undefined;
    const row = { ...r, id: r.id ?? this.newId(), createdAt: prev?.createdAt ?? now, updatedAt: now } as unknown as T;
    await table.put(row);
    return row;
  }

  /** Deletes one trip record with the files attached to it. */
  async deleteRecord(table: 'transport' | 'stays' | 'bookings' | 'notes' | 'tasks', id: string): Promise<void> {
    const db = this.db;
    await db.transaction('rw', db[table], db.attachments, db.blobs, async () => {
      const files = await db.attachments.where('ownerId').equals(id).toArray();
      await db.blobs.bulkDelete(files.map((f) => f.id));
      await db.attachments.bulkDelete(files.map((f) => f.id));
      await db[table].delete(id);
    });
  }

  // ---------------------------------------------------------------- files

  async addAttachment(tripId: string, ownerType: OwnerType, ownerId: string, file: { name: string; blob: Blob }): Promise<Attachment> {
    const now = this.now();
    const att: Attachment = {
      id: this.newId(),
      tripId,
      ownerType,
      ownerId,
      name: file.name,
      mime: file.blob.type || 'application/octet-stream',
      size: file.blob.size,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.transaction('rw', this.db.attachments, this.db.blobs, this.db.trips, async () => {
      await this.db.attachments.add(att);
      await this.db.blobs.add({ id: att.id, blob: file.blob });
      if (ownerType === 'cover') {
        const trip = await this.db.trips.get(tripId);
        if (trip?.coverId) {
          await this.db.attachments.delete(trip.coverId);
          await this.db.blobs.delete(trip.coverId);
        }
        if (trip) await this.db.trips.put({ ...trip, coverId: att.id, updatedAt: now });
      }
    });
    return att;
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.db.transaction('rw', this.db.attachments, this.db.blobs, this.db.trips, async () => {
      const att = await this.db.attachments.get(id);
      await this.db.attachments.delete(id);
      await this.db.blobs.delete(id);
      if (att?.ownerType === 'cover') {
        const trip = await this.db.trips.get(att.tripId);
        if (trip?.coverId === id) await this.db.trips.put({ ...trip, coverId: null, updatedAt: this.now() });
      }
    });
  }

  async getBlob(id: string): Promise<Blob | null> {
    return (await this.db.blobs.get(id))?.blob ?? null;
  }

  // ---------------------------------------------------------------- settings

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.db.meta.get(key);
    return row ? (row.value as T) : fallback;
  }
  async setSetting(key: string, value: unknown): Promise<void> {
    await this.db.meta.put({ key, value });
  }
}
