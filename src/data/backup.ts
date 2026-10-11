import { z } from 'zod';
import {
  attachmentSchema,
  bookingSchema,
  citySchema,
  noteSchema,
  planSchema,
  staySchema,
  stopSchema,
  taskSchema,
  transportSchema,
  tripSchema,
  visitSchema,
} from '../domain/model';
import { SCHEMA_VERSION, USER_TABLES, type WorldDb } from './db';

/** JSON backup of everything the user entered. Files are embedded as base64 only when asked. */
const backupSchema = z.object({
  app: z.literal('myworld'),
  schemaVersion: z.number().int(),
  exportedAt: z.string(),
  tables: z.object({
    cities: z.array(citySchema),
    visits: z.array(visitSchema),
    plans: z.array(planSchema),
    trips: z.array(tripSchema),
    stops: z.array(stopSchema),
    transport: z.array(transportSchema),
    stays: z.array(staySchema),
    bookings: z.array(bookingSchema),
    notes: z.array(noteSchema),
    attachments: z.array(attachmentSchema),
    tasks: z.array(taskSchema),
    meta: z.array(z.object({ key: z.string(), value: z.unknown() })),
  }),
  files: z.array(z.object({ id: z.string(), mime: z.string(), base64: z.string() })).default([]),
});
export type Backup = z.infer<typeof backupSchema>;

const toBase64 = async (blob: Blob): Promise<string> => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string, mime: string): Blob => {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Blob([bytes], { type: mime });
};

export async function exportBackup(db: WorldDb, withFiles: boolean, now: string): Promise<Backup> {
  const tables = Object.fromEntries(await Promise.all(USER_TABLES.map(async (t) => [t, await db[t].toArray()] as const))) as Backup['tables'];
  const files: Backup['files'] = [];
  if (withFiles) {
    for (const a of tables.attachments) {
      const row = await db.blobs.get(a.id);
      if (row) files.push({ id: a.id, mime: a.mime, base64: await toBase64(row.blob) });
    }
  }
  return { app: 'myworld', schemaVersion: SCHEMA_VERSION, exportedAt: now, tables, files };
}

export interface ImportSummary {
  trips: number;
  visits: number;
  plans: number;
  files: number;
  missingFiles: number;
}

/** Validates a backup without writing anything. Throws a readable error. */
export function parseBackup(json: unknown): Backup {
  const r = backupSchema.safeParse(json);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new Error(`Файл не похож на резервную копию MY WORLD (${issue ? issue.path.join('.') + ': ' + issue.message : 'неизвестная ошибка'})`);
  }
  if (r.data.schemaVersion > SCHEMA_VERSION) throw new Error('Копия сделана более новой версией приложения. Обновите приложение.');
  return r.data;
}

export function summarize(b: Backup): ImportSummary {
  const withBytes = new Set(b.files.map((f) => f.id));
  return {
    trips: b.tables.trips.length,
    visits: b.tables.visits.length,
    plans: b.tables.plans.length,
    files: withBytes.size,
    missingFiles: b.tables.attachments.filter((a) => !withBytes.has(a.id)).length,
  };
}

/** Replaces all user data with the backup in one transaction: either everything is restored or nothing changes. */
export async function restoreBackup(db: WorldDb, b: Backup): Promise<void> {
  const withBytes = new Set(b.files.map((f) => f.id));
  // Attachments whose bytes are not in the backup would be dead links: they are skipped.
  const attachments = b.tables.attachments.filter((a) => withBytes.has(a.id));
  const kept = new Set(attachments.map((a) => a.id));
  const trips = b.tables.trips.map((t) => (t.coverId && !kept.has(t.coverId) ? { ...t, coverId: null } : t));
  await db.transaction('rw', [...USER_TABLES.map((t) => db[t]), db.blobs], async () => {
    for (const t of USER_TABLES) await db[t].clear();
    await db.blobs.clear();
    await db.cities.bulkPut(b.tables.cities);
    await db.visits.bulkPut(b.tables.visits);
    await db.plans.bulkPut(b.tables.plans);
    await db.trips.bulkPut(trips);
    await db.stops.bulkPut(b.tables.stops);
    await db.transport.bulkPut(b.tables.transport);
    await db.stays.bulkPut(b.tables.stays);
    await db.bookings.bulkPut(b.tables.bookings);
    await db.notes.bulkPut(b.tables.notes);
    await db.tasks.bulkPut(b.tables.tasks);
    await db.meta.bulkPut(b.tables.meta.map((m) => ({ key: m.key, value: m.value })));
    await db.attachments.bulkPut(attachments);
    await db.blobs.bulkPut(b.files.map((f) => ({ id: f.id, blob: fromBase64(f.base64, f.mime) })));
  });
}
