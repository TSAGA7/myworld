/**
 * Collects travel news into feed/news.json and author posts for «Интересное» into feed/stories.json
 * (run hourly by .github/workflows/feed.yml).
 *   node --experimental-strip-types scripts/feed/collect.ts
 * No keys needed: Telegram channels are read through the public t.me/s preview, sites through RSS.
 * Check new sources without publishing: PROBE="t.me/name https://site/rss" DRY=1 … collect.ts
 */
import { STORY_KEEP_HOURS } from '../../src/feed/editorial.ts';
import { mergeNews, toItem } from '../../src/feed/news.ts';
import { parseFeed, parseTelegram, type RawPost } from '../../src/feed/parse.ts';
import type { FeedSource, NewsFile, NewsItem } from '../../src/feed/schema.ts';
import { SOURCES, STORY_SOURCES, sourceUrl, type SourceDef } from '../../src/feed/sources.ts';
import { classifyStatus, type ResortNotice, type ResortSourceState, type ResortStatusFile } from '../../src/feed/resortStatus.ts';
import { fetchText, readJson, writeJson } from './io.ts';

const now = new Date();
const dry = process.env.DRY === '1';
const probe: SourceDef[] = (process.env.PROBE ?? '').split(/\s+/).filter(Boolean).map((ref) => {
  const tg = ref.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]+)/);
  return tg ? { id: (tg[1] as string).toLowerCase(), name: `? ${tg[1]}`, kind: 'telegram', ref: tg[1] as string, section: 'Остальное', group: 'Проба' } : { id: ref, name: `? ${ref}`, kind: 'rss', ref, section: 'Остальное', group: 'Проба' };
});
const all = [...SOURCES, ...STORY_SOURCES, ...probe];
const isStory = new Set(STORY_SOURCES.map((s) => s.id));

/** For sources with `only`: keep posts whose rubric, link or text mentions one of the words. */
const wanted = (s: SourceDef, p: RawPost): boolean => {
  if (!s.only) return true;
  const hay = `${(p.categories ?? []).join(' ')} ${p.url} ${p.text}`.toLowerCase();
  return s.only.some((w) => hay.includes(w.toLowerCase()));
};

const fresh: NewsItem[] = [];
const freshStories: NewsItem[] = [];
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
        const it = isStory.has(s.id) ? toItem(s.id, p, undefined, 900) : toItem(s.id, p, s.lang);
        if (it) (isStory.has(s.id) ? freshStories : fresh).push(it);
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
/** Merges a fresh run into the previous file; items of removed sources disappear. */
/** Airlines, airports and carriers speak for themselves: their notices are never merged with each other. */
const OPERATOR_GROUPS = new Set(['Авиакомпании', 'Аэропорты', 'Перевозчики']);
const operators = new Set(SOURCES.filter((s) => OPERATOR_GROUPS.has(s.group)).map((s) => s.id));

function publish(name: string, defs: readonly SourceDef[], freshItems: NewsItem[], keepHours: number): void {
  const live = new Set(defs.map((s) => s.id));
  const prev = (readJson<NewsFile>(name)?.items ?? []).filter((it) => live.has(it.sourceId)).map((it) => ({ ...it, also: it.also.filter((a) => live.has(a.sourceId)) }));
  const items = mergeNews(prev, freshItems, now, keepHours, (id) => operators.has(id));
  const own = sources.filter((s) => live.has(s.id));
  writeJson(name, { updatedAt: now.toISOString(), sources: own, items } satisfies NewsFile);
  console.log(`${name}: ${items.length} записей из ${own.filter((s) => s.ok).length}/${own.length} источников`);
}
publish('news.json', SOURCES, fresh, 72);
publish('stories.json', STORY_SOURCES, freshStories, STORY_KEEP_HOURS);

// ---------------------------------------------------------------- ski resort notices
// Official Telegram channels of resorts from the catalog (catalog/resorts.json in this same `data` branch):
// a post that clearly reports closed/stopped/opened runs and lifts or snowfall becomes a notice. Nothing else.
type CatalogResort = { id: string; telegram?: string | null; tgSource?: 'official' | 'wikidata' | null; active?: boolean };
const catalog = (readJson<{ items: CatalogResort[] }>('../catalog/resorts.json')?.items ?? []).filter((r) => r.active !== false && r.telegram);
const prevStatus = readJson<ResortStatusFile>('resort-status.json');
const prevSync = new Map((prevStatus?.sources ?? []).map((s) => [`${s.resortId}|${s.channel}`, s.lastSyncAt]));
const notices: ResortNotice[] = [];
const resortSources: ResortSourceState[] = [];
for (const r of catalog) {
  const channel = String(r.telegram);
  const base = { resortId: r.id, channel, verification: r.tgSource === 'official' ? ('official' as const) : ('wikidata' as const) };
  try {
    const { posts } = parseTelegram(await fetchText(`https://t.me/s/${channel}`), channel);
    if (!posts.length) throw new Error('нет постов');
    for (const p of posts) {
      if (now.getTime() - Date.parse(p.at) > 72 * 3_600_000) continue;
      const level = classifyStatus(p.text);
      if (level) notices.push({ id: `${channel.toLowerCase()}:${p.id}`, resortId: r.id, level, text: p.text.replace(/\s+/g, ' ').slice(0, 400), url: p.url, at: p.at, source: channel });
    }
    resortSources.push({ ...base, ok: true, lastSyncAt: now.toISOString() });
  } catch (e) {
    resortSources.push({ ...base, ok: false, error: e instanceof Error ? e.message : String(e), lastSyncAt: prevSync.get(`${r.id}|${channel}`) ?? null });
  }
}
writeJson('resort-status.json', { updatedAt: now.toISOString(), sources: resortSources, items: notices } satisfies ResortStatusFile);
console.log(`resort-status.json: ${notices.length} уведомлений из ${resortSources.filter((s) => s.ok).length}/${resortSources.length} каналов курортов`);
