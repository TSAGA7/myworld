import { z } from 'zod';
import {
  bookingSchema,
  citySchema,
  diarySchema,
  expenseSchema,
  noteSchema,
  staySchema,
  stopSchema,
  taskSchema,
  transportSchema,
  tripSchema,
} from '../domain/model';
import type { WorldDb } from './db';

/**
 * A trip packed for another person: route, bookings, notes, checklist, expenses and diary (files are not included).
 * Sent as a link (#/join/<data>) or a .myworld file. Importing the same trip again merges by record:
 * the newer `updatedAt` wins, so two people can pass the trip back and forth.
 */
const bundleSchema = z.object({
  v: z.literal(1),
  from: z.string().default(''),
  trip: tripSchema,
  cities: z.array(citySchema),
  stops: z.array(stopSchema),
  transport: z.array(transportSchema),
  stays: z.array(staySchema),
  bookings: z.array(bookingSchema),
  notes: z.array(noteSchema),
  tasks: z.array(taskSchema),
  expenses: z.array(expenseSchema),
  diary: z.array(diarySchema),
});
export type TripBundle = z.infer<typeof bundleSchema>;

const TABLES = ['stops', 'transport', 'stays', 'bookings', 'notes', 'tasks', 'expenses', 'diary'] as const;

export async function packTrip(db: WorldDb, tripId: string, from: string): Promise<TripBundle> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error('Поездка не найдена');
  const parts = Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await db[t].where('tripId').equals(tripId).toArray()] as const)));
  const stops = parts.stops as TripBundle['stops'];
  const cities = (await db.cities.bulkGet(stops.map((s) => s.cityId))).filter((c): c is NonNullable<typeof c> => !!c);
  return { v: 1, from, trip: { ...trip, coverId: null }, cities, ...(parts as Omit<TripBundle, 'v' | 'from' | 'trip' | 'cities'>) };
}

// ---- compact text form: JSON → deflate → base64url

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeBundle(b: TripBundle): Promise<string> {
  return b64url(await pipe(new TextEncoder().encode(JSON.stringify(b)), new CompressionStream('deflate-raw')));
}

export async function decodeBundle(text: string): Promise<TripBundle> {
  let json: unknown;
  try {
    const raw = text.trim().startsWith('{') ? text : new TextDecoder().decode(await pipe(unb64url(text.trim()), new DecompressionStream('deflate-raw')));
    json = JSON.parse(raw);
  } catch {
    throw new Error('Ссылка или файл повреждены');
  }
  const r = bundleSchema.safeParse(json);
  if (!r.success) throw new Error('Это не поездка MY WORLD');
  return r.data;
}

export interface MergeSummary {
  isNew: boolean;
  added: number;
  updated: number;
  kept: number;
}

/** What importing would change, without writing. */
export async function previewMerge(db: WorldDb, b: TripBundle): Promise<MergeSummary> {
  const existing = await db.trips.get(b.trip.id);
  const s: MergeSummary = { isNew: !existing, added: 0, updated: 0, kept: 0 };
  for (const t of TABLES) {
    for (const r of b[t] as Array<{ id: string; updatedAt: string }>) {
      const cur = (await db[t].get(r.id)) as { updatedAt: string } | undefined;
      if (!cur) s.added++;
      else if (cur.updatedAt < r.updatedAt) s.updated++;
      else s.kept++;
    }
  }
  return s;
}

export async function importBundle(db: WorldDb, b: TripBundle): Promise<void> {
  await db.transaction('rw', [db.trips, db.cities, ...TABLES.map((t) => db[t])], async () => {
    const cur = await db.trips.get(b.trip.id);
    if (!cur) await db.trips.put(b.trip);
    else if (cur.updatedAt < b.trip.updatedAt) await db.trips.put({ ...b.trip, coverId: cur.coverId });
    else {
      // Keep local trip fields, but never lose members the other person added.
      const ids = new Set(cur.members.map((m) => m.id));
      const members = [...cur.members, ...b.trip.members.filter((m) => !ids.has(m.id))];
      if (members.length !== cur.members.length) await db.trips.put({ ...cur, members });
    }
    for (const c of b.cities) if (!(await db.cities.get(c.id))) await db.cities.put(c);
    for (const t of TABLES) {
      for (const r of b[t] as Array<{ id: string; updatedAt: string }>) {
        const local = (await db[t].get(r.id)) as { updatedAt: string } | undefined;
        if (!local || local.updatedAt < r.updatedAt) await (db[t] as unknown as { put(v: unknown): Promise<unknown> }).put(r);
      }
    }
  });
}
