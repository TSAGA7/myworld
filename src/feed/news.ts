import type { RawPost } from './parse.ts';
import type { NewsItem } from './schema.ts';
import { dedupe, splitPost, tagsOf } from './text.ts';

export const KEEP_HOURS = 72;
export const MAX_ITEMS = 400;

export function toItem(sourceId: string, p: RawPost, lang?: 'en', maxText = 320): NewsItem | null {
  const { title, text } = splitPost(p.text, 140, maxText);
  if (title.length < 12) return null;
  return { id: `${sourceId}:${p.id}`, sourceId, url: p.url, at: p.at, title, text, tags: tagsOf(p.text), also: [], ...(lang ? { lang } : {}) };
}

/** Previous file + fresh posts → last 72 hours, retellings merged, newest first. */
export function mergeNews(prev: readonly NewsItem[], fresh: readonly NewsItem[], now: Date, keepHours = KEEP_HOURS): NewsItem[] {
  const since = now.getTime() - keepHours * 3600e3;
  const future = now.getTime() + 3600e3;
  const known = new Set<string>();
  for (const it of prev) {
    known.add(it.url);
    for (const a of it.also) known.add(a.url);
  }
  const byId = new Map(prev.map((it) => [it.id, it]));
  for (const it of fresh) {
    const old = byId.get(it.id);
    // An edited post keeps its place (and its merged twins) but gets the new text.
    if (old) byId.set(it.id, { ...it, also: old.also });
    else if (!known.has(it.url)) byId.set(it.id, it);
  }
  const live = [...byId.values()].filter((it) => {
    const t = Date.parse(it.at);
    return t >= since && t <= future;
  });
  return dedupe(live).slice(0, MAX_ITEMS);
}

/** Items of the last `hours` before `now` — the input of the daily digest. */
export const recentNews = (items: readonly NewsItem[], now: Date, hours = 24): NewsItem[] =>
  items.filter((it) => now.getTime() - Date.parse(it.at) <= hours * 3600e3);
