import { z } from 'zod';
import { tagsOf } from './text.ts';
import type { Edition, FeedSource, InterestingFile, NewsItem, StoryItem, TranslationsFile } from './schema.ts';

/* ===================== Перевод зарубежных новостей */

/** A translation, or `skip` for news not worth showing (ads, US credit cards, listicles) — they stay hidden and are not offered again. */
export const TranslationDraftSchema = z
  .array(z.union([z.object({ id: z.string(), title: z.string().min(3).max(200), text: z.string().max(500) }), z.object({ id: z.string(), skip: z.literal(true) })]))
  .max(80);
export type TranslationDraft = z.infer<typeof TranslationDraftSchema>;

/** Foreign news still without Russian text, newest first. */
export const pendingTranslations = (news: readonly NewsItem[], t: TranslationsFile | null, limit = 40): NewsItem[] =>
  news.filter((n) => n.lang === 'en' && !t?.items[n.id]).slice(0, limit);

/** Adds translations of existing news and forgets those of news that left the feed. */
export function applyTranslations(file: TranslationsFile | null, draft: TranslationDraft, news: readonly NewsItem[], now: Date): TranslationsFile {
  const ids = new Set(news.map((n) => n.id));
  for (const d of draft) if (!ids.has(d.id)) throw new Error(`Новости ${d.id} нет в news.json`);
  const items: TranslationsFile['items'] = {};
  for (const [id, v] of Object.entries(file?.items ?? {})) if (ids.has(id)) items[id] = v;
  for (const d of draft) items[d.id] = 'skip' in d ? { title: '', text: '' } : { title: d.title.trim(), text: d.text.trim() };
  return { updatedAt: now.toISOString(), items };
}

/** Russian view of the feed: translated foreign news get their Russian text and topics, untranslated ones are hidden. */
export function localize(news: readonly NewsItem[], t: TranslationsFile | null): NewsItem[] {
  const out: NewsItem[] = [];
  for (const n of news) {
    if (n.lang !== 'en') out.push(n);
    else {
      const tr = t?.items[n.id];
      if (tr?.title) out.push({ ...n, title: tr.title, text: tr.text, tags: tagsOf(`${tr.title}\n${tr.text}`) });
    }
  }
  return out;
}

/* ===================== «Интересное» */

export const STORY_KEEP_HOURS = 24 * 7;
export const EDITIONS_KEPT = 14;

export const StoryDraftSchema = z.object({
  items: z
    .array(z.object({ country: z.string().regex(/^([A-Z]{2})?$/), place: z.string().min(2).max(40), text: z.string().min(20).max(400), storyIds: z.array(z.string()).min(1).max(3) }))
    .min(1)
    .max(8),
});
export type StoryDraft = z.infer<typeof StoryDraftSchema>;

/** Moscow date and part of day of a moment: before 15:00 — morning edition. */
export function editionSlot(now: Date): { date: string; part: Edition['part'] } {
  const msk = new Date(now.getTime() + 3 * 3600e3);
  return { date: msk.toISOString().slice(0, 10), part: msk.getUTCHours() < 15 ? 'morning' : 'evening' };
}

/** Posts of the last `hours` that no previous edition has used. */
export function storyCandidates(stories: readonly NewsItem[], file: InterestingFile | null, now: Date, hours = 48): NewsItem[] {
  const used = new Set((file?.editions ?? []).flatMap((e) => e.items.flatMap((i) => i.storyIds)));
  return stories.filter((s) => !used.has(s.id) && now.getTime() - Date.parse(s.at) <= hours * 3600e3);
}

/** Draft → edition; links to the author posts are taken from stories.json, never written by the AI. */
export function buildEdition(draft: StoryDraft, stories: readonly NewsItem[], sources: readonly FeedSource[], now: Date): Edition {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const items = draft.items.map((d): StoryItem => {
    const links = d.storyIds.map((id) => {
      const s = byId.get(id);
      if (!s) throw new Error(`Поста ${id} нет в stories.json`);
      return { name: sources.find((x) => x.id === s.sourceId)?.name ?? s.sourceId, url: s.url };
    });
    const image = d.storyIds.map((id) => byId.get(id)?.image).find(Boolean);
    return { country: d.country, place: d.place.trim(), text: d.text.trim(), storyIds: d.storyIds, ...(image ? { image } : {}), links };
  });
  const slot = editionSlot(now);
  return { id: `${slot.date}-${slot.part}`, ...slot, createdAt: now.toISOString(), items };
}

export const addEdition = (file: InterestingFile | null, e: Edition): InterestingFile => ({
  updatedAt: e.createdAt,
  editions: [e, ...(file?.editions ?? []).filter((x) => x.id !== e.id)].sort((a, b) => b.id.localeCompare(a.id)).slice(0, EDITIONS_KEPT),
});
