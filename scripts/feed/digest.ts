/**
 * Daily AI digest (written by the scheduled Claude task, see scripts/feed/DIGEST.md).
 *   node --experimental-strip-types scripts/feed/digest.ts input            → news of the last 24 h for the AI, one per line
 *   node --experimental-strip-types scripts/feed/digest.ts publish <draft>  → checks the draft and writes feed/digest.json
 */
import { readFileSync } from 'node:fs';
import { addDigest, buildDigest, DraftSchema, moscowDate } from '../../src/feed/digest.ts';
import { recentNews } from '../../src/feed/news.ts';
import { TAG_LABEL, type DigestFile, type NewsFile } from '../../src/feed/schema.ts';
import { readJson, writeJson } from './io.ts';

const now = new Date();
const news = readJson<NewsFile>('news.json');
if (!news) {
  console.error('Нет feed/news.json — сначала должен отработать сбор новостей');
  process.exit(1);
}
const [cmd, arg] = process.argv.slice(2);

if (cmd === 'input') {
  const items = recentNews(news.items, now);
  const name = (id: string) => news.sources.find((s) => s.id === id)?.name ?? id;
  console.log(`Дата дайджеста: ${moscowDate(now)}. Новостей за 24 часа: ${items.length}\n`);
  for (const it of items) {
    const tags = it.tags.map((t) => TAG_LABEL[t]).join(', ');
    const also = it.also.length ? ` (+ ещё ${it.also.length} ист.)` : '';
    console.log(`[${it.id}] ${name(it.sourceId)}${also} · ${it.at.slice(0, 16).replace('T', ' ')} UTC${tags ? ` · ${tags}` : ''}\n${it.title}\n${it.text}\n`);
  }
} else if (cmd === 'publish' && arg) {
  const draft = DraftSchema.parse(JSON.parse(readFileSync(arg, 'utf8')));
  const digest = buildDigest(draft, news.items, news.sources, moscowDate(now), now);
  writeJson('digest.json', addDigest(readJson<DigestFile>('digest.json'), digest), true);
  console.log(`digest.json: ${digest.date}, главное ${digest.main.length}, остальное ${digest.other.length}, источников ${digest.sourcesCount}`);
} else {
  console.error('Использование: digest.ts input | digest.ts publish <draft.json>');
  process.exit(2);
}
