// Copies the self-hosted OCR engine and Russian/English language data into public/ocr (not committed, ~11 MB).
// The app loads them only when the user imports a screenshot; the service worker caches them after first use.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = dirname(dirname(new URL(import.meta.url).pathname));
const out = join(root, 'public', 'ocr');
mkdirSync(join(out, 'lang'), { recursive: true });
const pkg = (name) => dirname(require.resolve(`${name}/package.json`));
// The engine version must match tesseract.js, so it is resolved from tesseract.js itself.
const core = dirname(createRequire(join(pkg('tesseract.js'), 'package.json')).resolve('tesseract.js-core/package.json'));
const files = [
  [join(pkg('tesseract.js'), 'dist', 'worker.min.js'), join(out, 'worker.min.js')],
  ...['relaxedsimd-lstm', 'simd-lstm', 'lstm'].map((v) => [join(core, `tesseract-core-${v}.wasm.js`), join(out, `tesseract-core-${v}.wasm.js`)]),
  [join(pkg('@tesseract.js-data/eng'), '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz')],
  [join(pkg('@tesseract.js-data/rus'), '4.0.0_best_int', 'rus.traineddata.gz'), join(out, 'lang', 'rus.traineddata.gz')],
];
for (const [from, to] of files) {
  if (!existsSync(from)) throw new Error(`missing ${from}`);
  copyFileSync(from, to);
}
console.log(`ocr assets: ${files.length} files → public/ocr`);
