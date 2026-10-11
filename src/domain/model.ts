import { z } from 'zod';

/**
 * MY WORLD data model.
 * Reference geography (countries, the city catalog) lives in static files and is never written.
 * User data lives in IndexedDB tables, one table per entity; records point at each other by id.
 *
 * Dates of days are LocalDate strings (YYYY-MM-DD) and clock times are "HH:mm" in the local time of the place:
 * nothing is converted between time zones, so nothing can shift.
 */

export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const clockTime = z.string().regex(/^\d{2}:\d{2}$/);
const iso = z.string(); // ISO 8601 moment with offset
const optDate = localDate.nullable().default(null);
const optTime = clockTime.nullable().default(null);
const text = z.string().default('');
const money = z.number().finite().nonnegative().nullable().default(null);

const stamps = { createdAt: iso, updatedAt: iso };

/** A city the user has touched: a snapshot of a catalog entry ("ne:<id>") or a city the user placed ("u:<uuid>"). */
export const citySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameEn: text,
  countryId: z.string().min(1),
  /** Coordinates are null when the user has not located a custom city yet: such a city is never drawn on the map. */
  lat: z.number().min(-90).max(90).nullable(),
  lon: z.number().min(-180).max(180).nullable(),
  region: text,
  source: z.enum(['catalog', 'custom']),
  ...stamps,
});
export type City = z.infer<typeof citySchema>;

/**
 * A fact: the user has been to a city (cityId set) or to a country without naming a city (cityId null).
 * One record per place, `key` is unique: repeated actions update this record instead of adding new ones.
 */
export const visitSchema = z.object({
  id: z.string(),
  key: z.string(),
  cityId: z.string().nullable(),
  countryId: z.string(),
  /** First known visit date; null when the user did not give one. */
  date: optDate,
  /** Trips that confirmed this visit. */
  tripIds: z.array(z.string()).default([]),
  manual: z.boolean().default(false),
  ...stamps,
});
export type Visit = z.infer<typeof visitSchema>;

/** An intention: the place is on the map as planned. Same one-record-per-place rule as visits. */
export const planSchema = z.object({
  id: z.string(),
  key: z.string(),
  cityId: z.string().nullable(),
  countryId: z.string(),
  tripIds: z.array(z.string()).default([]),
  manual: z.boolean().default(false),
  ...stamps,
});
export type PlannedMark = z.infer<typeof planSchema>;

export const tripSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  startDate: optDate,
  endDate: optDate,
  /** Countries of the trip in the user's order; countries of the stops are kept in this list automatically. */
  countryIds: z.array(z.string()).default([]),
  note: text,
  coverId: z.string().nullable().default(null),
  ...stamps,
});
export type Trip = z.infer<typeof tripSchema>;

/** TripDestination: one stop of the route. */
export const stopSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  order: z.number().int().nonnegative(),
  cityId: z.string(),
  countryId: z.string(),
  startDate: optDate,
  endDate: optDate,
  note: text,
  ...stamps,
});
export type TripStop = z.infer<typeof stopSchema>;

export const TRANSPORT_MODES = ['flight', 'train', 'bus', 'ferry', 'car', 'other'] as const;
export const transportSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  mode: z.enum(TRANSPORT_MODES),
  carrier: text,
  number: text,
  from: text,
  to: text,
  departDate: optDate,
  departTime: optTime,
  arriveDate: optDate,
  arriveTime: optTime,
  confirmation: text,
  price: money,
  currency: text,
  url: text,
  note: text,
  ...stamps,
});
export type TransportBooking = z.infer<typeof transportSchema>;

export const STAY_KINDS = ['hotel', 'apartment', 'hostel', 'other'] as const;
export const staySchema = z.object({
  id: z.string(),
  tripId: z.string(),
  kind: z.enum(STAY_KINDS),
  name: z.string().min(1),
  address: text,
  cityId: z.string().nullable().default(null),
  lat: z.number().nullable().default(null),
  lon: z.number().nullable().default(null),
  checkIn: optDate,
  checkOut: optDate,
  confirmation: text,
  price: money,
  currency: text,
  url: text,
  contact: text,
  note: text,
  ...stamps,
});
export type AccommodationBooking = z.infer<typeof staySchema>;

export const BOOKING_KINDS = ['tour', 'event', 'tickets', 'restaurant', 'rental', 'other'] as const;
export const bookingSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  kind: z.enum(BOOKING_KINDS),
  title: z.string().min(1),
  date: optDate,
  time: optTime,
  place: text,
  confirmation: text,
  price: money,
  currency: text,
  url: text,
  note: text,
  ...stamps,
});
export type GeneralBooking = z.infer<typeof bookingSchema>;

export const NOTE_KINDS = ['note', 'link', 'address', 'contact'] as const;
export const noteSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  kind: z.enum(NOTE_KINDS),
  title: text,
  body: text,
  url: text,
  ...stamps,
});
export type TripNote = z.infer<typeof noteSchema>;

export const OWNER_TYPES = ['trip', 'cover', 'transport', 'stay', 'booking', 'stop', 'note'] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];
/** File metadata; the bytes live in a separate table so lists never load them. */
export const attachmentSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  ownerType: z.enum(OWNER_TYPES),
  ownerId: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  ...stamps,
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const taskSchema = z.object({
  id: z.string(),
  tripId: z.string(),
  title: z.string().min(1),
  done: z.boolean().default(false),
  order: z.number().int().nonnegative(),
  ...stamps,
});
export type TripTask = z.infer<typeof taskSchema>;

export const METHODOLOGIES = ['m195', 'un193', 'all'] as const;
export type Methodology = (typeof METHODOLOGIES)[number];

export const visitKey = (cityId: string | null, countryId: string): string => (cityId ? `city:${cityId}` : `country:${countryId}`);
