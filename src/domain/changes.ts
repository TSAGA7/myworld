/** One release in the changelog: `n` grows by one with every release that has something to tell. */
export interface Release {
  n: number;
  date: string;
  items: string[];
}

/** The newest release number in a changelog (0 for an empty one). */
export const latestRelease = (log: readonly Release[]): number => log.reduce((m, r) => Math.max(m, r.n), 0);

/** What was added after release `after`: newest first, at most `limit` lines, no repeats. */
export function newerItems(log: readonly Release[], after: number, limit = 6): string[] {
  const out: string[] = [];
  for (const r of [...log].sort((a, b) => b.n - a.n)) {
    if (r.n <= after) break;
    for (const it of r.items) if (!out.includes(it)) out.push(it);
  }
  return out.slice(0, limit);
}

/** Parses a changelog fetched from the network; anything malformed is dropped rather than shown. */
export function parseChangelog(json: unknown): Release[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (r): r is Release =>
      !!r && typeof r === 'object' && typeof (r as Release).n === 'number' && typeof (r as Release).date === 'string' && Array.isArray((r as Release).items) && (r as Release).items.every((x) => typeof x === 'string'),
  );
}

/** A lazy chunk of an older build is gone from the server: the app was updated while this screen was open. */
export const isUpdateError = (e: unknown): boolean =>
  /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i.test(e instanceof Error ? `${e.name} ${e.message}` : String(e));
