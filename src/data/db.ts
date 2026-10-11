import Dexie, { type Table } from 'dexie';
import type {
  AccommodationBooking,
  Attachment,
  City,
  GeneralBooking,
  PlannedMark,
  TransportBooking,
  Trip,
  TripNote,
  TripStop,
  TripTask,
  Visit,
} from '../domain/model';

export interface BlobRow {
  id: string;
  blob: Blob;
}
export interface MetaRow {
  key: string;
  value: unknown;
}

/**
 * MY WORLD database. The name is unique so it never touches Fitapp's IndexedDB on the same origin.
 * Schema changes: add a new `this.version(n)` block with an upgrade function; never edit an old one.
 */
export class WorldDb extends Dexie {
  cities!: Table<City, string>;
  visits!: Table<Visit, string>;
  plans!: Table<PlannedMark, string>;
  trips!: Table<Trip, string>;
  stops!: Table<TripStop, string>;
  transport!: Table<TransportBooking, string>;
  stays!: Table<AccommodationBooking, string>;
  bookings!: Table<GeneralBooking, string>;
  notes!: Table<TripNote, string>;
  attachments!: Table<Attachment, string>;
  blobs!: Table<BlobRow, string>;
  tasks!: Table<TripTask, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'myworld') {
    super(name);
    this.version(1).stores({
      cities: 'id, countryId',
      visits: 'id, &key, cityId, countryId',
      plans: 'id, &key, cityId, countryId',
      trips: 'id, startDate',
      stops: 'id, tripId, cityId',
      transport: 'id, tripId',
      stays: 'id, tripId',
      bookings: 'id, tripId',
      notes: 'id, tripId',
      attachments: 'id, tripId, ownerId',
      blobs: 'id',
      tasks: 'id, tripId',
      meta: 'key',
    });
  }
}

export const SCHEMA_VERSION = 1;

/** Tables holding user records, in export order. */
export const USER_TABLES = ['cities', 'visits', 'plans', 'trips', 'stops', 'transport', 'stays', 'bookings', 'notes', 'attachments', 'tasks', 'meta'] as const;
export type UserTable = (typeof USER_TABLES)[number];
/** Tables that belong to one trip and are removed with it. */
export const TRIP_TABLES = ['stops', 'transport', 'stays', 'bookings', 'notes', 'tasks'] as const;
export type TripTable = (typeof TRIP_TABLES)[number];
