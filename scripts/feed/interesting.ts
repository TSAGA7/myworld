/**
 * «Интересное» — morning and evening selection from author channels (scheduled Claude task, scripts/feed/EDITORIAL.md).
 *   node --experimental-strip-types scripts/feed/interesting.ts input            → unused posts of the last 48 h
 *   node --experimental-strip-types scripts/feed/interesting.ts publish <file>   → checks and writes feed/interesting.json
 */
import { readFileSync } from 'node:fs';
import { addEdition, buildEdition, editionSlot, storyCandidates, StoryDraftSchema } from '../../src/feed/editorial.ts';
import type { InterestingFile, NewsFile } from '../../src/feed/schema.ts';
import { readJson, writeJson } from './io.ts';

const now = new Date();
const stories = readJson<NewsFile>('stories.json');
if (!stories) {
  console.error('Нет feed/stories.json — сначала должен отработать сбор');
  process.exit(1);
}
const file = readJson<InterestingFile>('interesting.json');
const [cmd, arg] = process.argv.slice(2);
if (cmd === 'input') {
  const slot = editionSlot(now);
  const list = storyCandidates(stories.items, file, now);
  const name = (id: string) => stories.sources.find((s) => s.id === id)?.name ?? id;
  console.log(`Выпуск: ${slot.date}, ${slot.part === 'morning' ? 'утро' : 'вечер'}. Неиспользованных постов: ${list.length}\n`);
  for (const s of list) console.log(`[${s.id}] ${name(s.sourceId)} · ${s.at.slice(0, 16).replace('T', ' ')} UTC\n${s.title}\n${s.text}\n`);
} else if (cmd === 'publish' && arg) {
  const draft = StoryDraftSchema.parse(JSON.parse(readFileSync(arg, 'utf8')));
  const ed = buildEdition(draft, stories.items, stories.sources, now);
  writeJson('interesting.json', addEdition(file, ed), true);
  console.log(`interesting.json: ${ed.id}, историй ${ed.items.length}`);
} else {
  console.error('Использование: interesting.ts input | interesting.ts publish <draft.json>');
  process.exit(2);
}
