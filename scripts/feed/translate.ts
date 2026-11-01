/**
 * Russian text for foreign news (done by the scheduled Claude tasks, see scripts/feed/EDITORIAL.md).
 *   node --experimental-strip-types scripts/feed/translate.ts input            → untranslated news as JSON
 *   node --experimental-strip-types scripts/feed/translate.ts publish <file>   → checks and writes feed/translations.json
 */
import { readFileSync } from 'node:fs';
import { applyTranslations, pendingTranslations, TranslationDraftSchema } from '../../src/feed/editorial.ts';
import type { NewsFile, TranslationsFile } from '../../src/feed/schema.ts';
import { readJson, writeJson } from './io.ts';

const news = readJson<NewsFile>('news.json');
if (!news) {
  console.error('Нет feed/news.json');
  process.exit(1);
}
const file = readJson<TranslationsFile>('translations.json');
const [cmd, arg] = process.argv.slice(2);
if (cmd === 'input') {
  const todo = pendingTranslations(news.items, file);
  console.log(JSON.stringify(todo.map((n) => ({ id: n.id, title: n.title, text: n.text })), null, 1));
} else if (cmd === 'publish' && arg) {
  const draft = TranslationDraftSchema.parse(JSON.parse(readFileSync(arg, 'utf8')));
  const out = applyTranslations(file, draft, news.items, new Date());
  writeJson('translations.json', out);
  console.log(`translations.json: +${draft.length}, всего ${Object.keys(out.items).length}`);
} else {
  console.error('Использование: translate.ts input | translate.ts publish <draft.json>');
  process.exit(2);
}
