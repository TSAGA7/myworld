/**
 * Collects travel news into feed/news.json (run hourly by .github/workflows/feed.yml).
 *   node --experimental-strip-types scripts/feed/collect.ts
 * No keys needed: Telegram channels are read through the public t.me/s preview, sites through RSS.
 */
import { mergeNews, toItem } from '../../src/feed/news.ts';
import { parseFeed, parseTelegram } from '../../src/feed/parse.ts';
import type { FeedSource, NewsFile, NewsItem } from '../../src/feed/schema.ts';
import { SOURCES, sourceUrl } from '../../src/feed/sources.ts';
import { fetchText, readJson, writeJson } from './io.ts';

const now = new Date();
const prev = readJson<NewsFile>('news.json');
const fresh: NewsItem[] = [];

const sources: FeedSource[] = await Promise.all(
  SOURCES.map(async (s): Promise<FeedSource> => {
    const url = sourceUrl(s);
    try {
      const body = await fetchText(url);
      const { posts } = s.kind === 'telegram' ? parseTelegram(body, s.ref) : parseFeed(body);
      if (!posts.length) throw new Error('нет постов');
      for (const p of posts) {
        const it = toItem(s.id, p);
        if (it) fresh.push(it);
      }
      console.log(`✓ ${s.name}: ${posts.length}`);
      return { id: s.id, name: s.name, kind: s.kind, url: s.kind === 'telegram' ? `https://t.me/${s.ref}` : url, ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.log(`✗ ${s.name}: ${error}`);
      return { id: s.id, name: s.name, kind: s.kind, url: s.kind === 'telegram' ? `https://t.me/${s.ref}` : url, ok: false, error };
    }
  }),
);

const items = mergeNews(prev?.items ?? [], fresh, now);
writeJson('news.json', { updatedAt: now.toISOString(), sources, items } satisfies NewsFile);
console.log(`news.json: ${items.length} новостей из ${sources.filter((s) => s.ok).length}/${sources.length} источников`);
