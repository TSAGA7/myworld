/**
 * Collects travel news into feed/news.json (run hourly by .github/workflows/feed.yml).
 *   node --experimental-strip-types scripts/feed/collect.ts
 * No keys needed: Telegram channels are read through the public t.me/s preview, sites through RSS.
 * Check new sources without publishing: PROBE="t.me/name https://site/rss" DRY=1 … collect.ts
 */
import { mergeNews, toItem } from '../../src/feed/news.ts';
import { parseFeed, parseTelegram, type RawPost } from '../../src/feed/parse.ts';
import type { FeedSource, NewsFile, NewsItem } from '../../src/feed/schema.ts';
import { SOURCES, sourceUrl, type SourceDef } from '../../src/feed/sources.ts';
import { fetchText, readJson, writeJson } from './io.ts';

const now = new Date();
const dry = process.env.DRY === '1';
const probe: SourceDef[] = (process.env.PROBE ?? '').split(/\s+/).filter(Boolean).map((ref) => {
  const tg = ref.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]+)/);
  return tg ? { id: (tg[1] as string).toLowerCase(), name: `? ${tg[1]}`, kind: 'telegram', ref: tg[1] as string, section: 'Остальное', group: 'Проба' } : { id: ref, name: `? ${ref}`, kind: 'rss', ref, section: 'Остальное', group: 'Проба' };
});
const all = [...SOURCES, ...probe];

/** For sources with `only`: keep posts whose rubric, link or text mentions one of the words. */
const wanted = (s: SourceDef, p: RawPost): boolean => {
  if (!s.only) return true;
  const hay = `${(p.categories ?? []).join(' ')} ${p.url} ${p.text}`.toLowerCase();
  return s.only.some((w) => hay.includes(w.toLowerCase()));
};

const fresh: NewsItem[] = [];
const sources: FeedSource[] = await Promise.all(
  all.map(async (s): Promise<FeedSource> => {
    const url = sourceUrl(s);
    const base = { id: s.id, name: s.name, kind: s.kind, url: s.kind === 'telegram' ? `https://t.me/${s.ref}` : url, section: s.section, group: s.group };
    try {
      const body = await fetchText(url);
      const { title, posts } = s.kind === 'telegram' ? parseTelegram(body, s.ref) : parseFeed(body);
      if (!posts.length) throw new Error(`нет постов${title ? ` («${title}»)` : ''}`);
      const kept = posts.filter((p) => wanted(s, p));
      for (const p of kept) {
        const it = toItem(s.id, p);
        if (it) fresh.push(it);
      }
      const last = posts.map((p) => p.at).sort().at(-1)?.slice(0, 10);
      console.log(`✓ ${s.name}${title ? ` «${title}»` : ''}: ${kept.length}/${posts.length}, последний ${last}`);
      if (dry && s.only) console.log(`  рубрики: ${[...new Set(posts.flatMap((p) => p.categories ?? []))].slice(0, 30).join(' | ')}`);
      return { ...base, ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`✗ ${s.name}: ${error}`);
      return { ...base, ok: false, error };
    }
  }),
);

if (dry) {
  console.log('DRY=1 — ничего не записано');
  process.exit(0);
}
const live = new Set(SOURCES.map((s) => s.id));
const prev = (readJson<NewsFile>('news.json')?.items ?? []).filter((it) => live.has(it.sourceId)).map((it) => ({ ...it, also: it.also.filter((a) => live.has(a.sourceId)) }));
const items = mergeNews(prev, fresh, now);
writeJson('news.json', { updatedAt: now.toISOString(), sources: sources.filter((s) => live.has(s.id)), items } satisfies NewsFile);
console.log(`news.json: ${items.length} новостей из ${sources.filter((s) => s.ok).length}/${sources.length} источников`);
