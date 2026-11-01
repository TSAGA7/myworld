import { z } from 'zod';
import type { Digest, DigestEntry, DigestFile, FeedSource, NewsItem } from './schema.ts';

/** What the AI writes: texts and the ids of the news they retell. Links are attached here from news.json. */
export const DraftEntrySchema = z.object({ title: z.string().min(3).max(160), text: z.string().min(10).max(600), newsIds: z.array(z.string()).min(1).max(6) });
export const DraftSchema = z.object({
  lead: z.string().min(10).max(300),
  main: z.array(DraftEntrySchema).min(1).max(6),
  other: z.array(DraftEntrySchema).max(12),
});
export type Draft = z.infer<typeof DraftSchema>;

export const DIGEST_DAYS = 7;

/** Turns the AI draft into a digest; throws if it cites news that do not exist (no invented links). */
export function buildDigest(draft: Draft, news: readonly NewsItem[], sources: readonly FeedSource[], date: string, now: Date): Digest {
  const byId = new Map(news.map((n) => [n.id, n]));
  const sourceName = (id: string) => sources.find((s) => s.id === id)?.name ?? id;
  const used = new Set<string>();
  const entry = (e: Draft['main'][number]): DigestEntry => {
    const links: DigestEntry['links'] = [];
    for (const id of e.newsIds) {
      const n = byId.get(id);
      if (!n) throw new Error(`Новости ${id} нет в news.json`);
      for (const l of [{ sourceId: n.sourceId, url: n.url }, ...n.also]) {
        if (!links.some((x) => x.url === l.url)) links.push({ name: sourceName(l.sourceId), url: l.url });
        used.add(l.sourceId);
      }
    }
    return { title: e.title.trim(), text: e.text.trim(), newsIds: e.newsIds, links: links.slice(0, 4) };
  };
  const main = draft.main.map(entry);
  const other = draft.other.map(entry);
  return { date, createdAt: now.toISOString(), lead: draft.lead.trim(), main, other, sourcesCount: used.size };
}

/** Puts the digest of `date` first, replacing an earlier version of the same day; keeps a week. */
export const addDigest = (file: DigestFile | null, d: Digest): DigestFile => ({
  updatedAt: d.createdAt,
  digests: [d, ...(file?.digests ?? []).filter((x) => x.date !== d.date)].sort((a, b) => b.date.localeCompare(a.date)).slice(0, DIGEST_DAYS),
});

/** Moscow calendar date of a moment. */
export const moscowDate = (now: Date): string => new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
