import { z } from 'zod';
import {
  attachmentSchema,
  bookingSchema,
  citySchema,
  diarySchema,
  expenseSchema,
  guideSchema,
  noteSchema,
  staySchema,
  stopSchema,
  taskSchema,
  transportSchema,
  tripSchema,
} from '../domain/model';
import type { WorldDb } from './db';

/**
 * A trip packed for another person or device: route, bookings, notes, checklist, expenses, diary and guides.
 * As a link (#/join/<data>) it carries no files; as a .myworld file it also carries the cover, tickets and documents.
 * Importing the same trip again merges by record: the newer `updatedAt` wins, so two people can pass it back and forth.
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
  // Added later: links made before them simply have none.
  guides: z.array(guideSchema).default([]),
  attachments: z.array(attachmentSchema).default([]),
  files: z.array(z.object({ id: z.string(), mime: z.string(), base64: z.string() })).default([]),
});
export type TripBundle = z.infer<typeof bundleSchema>;

const TABLES = ['stops', 'transport', 'stays', 'bookings', 'notes', 'tasks', 'expenses', 'diary', 'guides'] as const;

const toBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string, mime: string): Blob => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: mime });

/** Packs a trip. `withFiles` adds the cover, tickets and documents (for a file, too big for a link). */
export async function packTrip(db: WorldDb, tripId: string, from: string, withFiles = false): Promise<TripBundle> {
  const trip = await db.trips.get(tripId);
  if (!trip) throw new Error('Поездка не найдена');
  const parts = Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await db[t].where('tripId').equals(tripId).toArray()] as const)));
  const stops = parts.stops as TripBundle['stops'];
  const cities = (await db.cities.bulkGet(stops.map((s) => s.cityId))).filter((c): c is NonNullable<typeof c> => !!c);
  const attachments: TripBundle['attachments'] = [];
  const files: TripBundle['files'] = [];
  if (withFiles) {
    for (const a of await db.attachments.where('tripId').equals(tripId).toArray()) {
      const row = await db.blobs.get(a.id);
      if (!row) continue;
      attachments.push(a);
      files.push({ id: a.id, mime: a.mime, base64: await toBase64(row.blob) });
    }
  }
  // Offline guides are long HTML: fine in a file, but they would make a link unusable.
  if (!withFiles) parts.guides = [];
  const coverId = trip.coverId && attachments.some((a) => a.id === trip.coverId) ? trip.coverId : null;
  return { v: 1, from, trip: { ...trip, coverId }, cities, ...(parts as Omit<TripBundle, 'v' | 'from' | 'trip' | 'cities' | 'attachments' | 'files'>), attachments, files };
}

/** The trip as a file for another device: «Армения.myworld.json» (JSON, so any phone lets you pick it). */
export async function tripFile(db: WorldDb, tripId: string, from: string): Promise<File> {
  const b = await packTrip(db, tripId, from, true);
  const name = (b.trip.title || 'Поездка').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60) || 'Поездка';
  return new File([JSON.stringify(b)], `${name}.myworld.json`, { type: 'application/json' });
}

// A trip read from a file waits here while #/join/file shows what it will add.
let pendingFile: TripBundle | null = null;
export const setPendingTrip = (b: TripBundle | null): void => {
  pendingFile = b;
};
export const pendingTrip = (): TripBundle | null => pendingFile;

/** Reads a trip file (or a pasted link code). Throws a readable error. */
export async function readTripFile(file: File): Promise<TripBundle> {
  if (file.size > 300 * 1024 * 1024) throw new Error('Файл слишком большой');
  const text = await file.text();
  const code = text.trim().match(/#\/join\/([\w-]+)/)?.[1];
  return decodeBundle(code ?? text);
}

// ---- compact text form: JSON → deflate → base64url

export const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
export async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
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
  if (!r.success) {
    if (json && typeof json === 'object' && (json as { app?: unknown }).app === 'myworld') throw new Error('Это резервная копия всего приложения — она восстанавливается в «Настройки → Резервная копия»');
    throw new Error('Это не поездка MY WORLD');
  }
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
  const withBytes = new Set(b.files.map((f) => f.id));
  const attachments = b.attachments.filter((a) => a.tripId === b.trip.id && withBytes.has(a.id));
  const coverOk = (id: string | null) => !!id && attachments.some((a) => a.id === id);
  await db.transaction('rw', [db.trips, db.cities, db.attachments, db.blobs, ...TABLES.map((t) => db[t])], async () => {
    const cur = await db.trips.get(b.trip.id);
    if (!cur) await db.trips.put({ ...b.trip, coverId: coverOk(b.trip.coverId) ? b.trip.coverId : null });
    else if (cur.updatedAt < b.trip.updatedAt) await db.trips.put({ ...b.trip, coverId: coverOk(b.trip.coverId) ? b.trip.coverId : cur.coverId });
    else {
      // Keep local trip fields, but never lose members the other person added; take the cover if there is none.
      const ids = new Set(cur.members.map((m) => m.id));
      const members = [...cur.members, ...b.trip.members.filter((m) => !ids.has(m.id))];
      const coverId = cur.coverId ?? (coverOk(b.trip.coverId) ? b.trip.coverId : null);
      if (members.length !== cur.members.length || coverId !== cur.coverId) await db.trips.put({ ...cur, members, coverId });
    }
    for (const c of b.cities) if (!(await db.cities.get(c.id))) await db.cities.put(c);
    for (const t of TABLES) {
      for (const r of b[t] as Array<{ id: string; updatedAt: string }>) {
        const local = (await db[t].get(r.id)) as { updatedAt: string } | undefined;
        if (!local || local.updatedAt < r.updatedAt) await (db[t] as unknown as { put(v: unknown): Promise<unknown> }).put(r);
      }
    }
    for (const a of attachments) {
      if (await db.attachments.get(a.id)) continue;
      const f = b.files.find((x) => x.id === a.id);
      if (!f) continue;
      await db.attachments.put(a);
      await db.blobs.put({ id: a.id, blob: fromBase64(f.base64, f.mime) });
    }
  });
}
