// Builds public/data/photo-index.bin from public/data/cities.tsv (not committed, rebuilt by dev/build).
// A compact copy of the city catalog for «Отметить по фото»: coordinates, size and country of every row,
// ~3 MB of typed arrays instead of an 11 MB text and 194 000 objects — small enough for a phone that also has
// the photo picker open. Row i here is line i of cities.tsv, where the names are read only for the places found.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAGIC = 0x3150574d; // "MWP1"

/** @param {string} tsv */
export function encodePhotoIndex(tsv) {
  const lines = tsv.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const count = lines.length;
  const lat = new Float32Array(count);
  const lon = new Float32Array(count);
  const weight = new Float32Array(count);
  const country = new Uint16Array(count).fill(0xffff);
  const countries = [];
  const idx = new Map();
  lines.forEach((line, i) => {
    const f = line.split('\t');
    const cid = f[3];
    if (!f[0] || !f[1] || !cid) return;
    let ci = idx.get(cid);
    if (ci === undefined) {
      ci = countries.push(cid) - 1;
      idx.set(cid, ci);
    }
    country[i] = ci;
    lat[i] = Number(f[4]);
    lon[i] = Number(f[5]);
    // Bigger places win over tiny neighbours a little closer, so a photo in a suburb lands on the city.
    weight[i] = Math.pow(Math.max(Number(f[6]) || 0, 500) + (f[8] === '1' ? 5e6 : 0), 0.2);
  });
  const head = new TextEncoder().encode(JSON.stringify({ countries }));
  const headLen = Math.ceil(head.length / 4) * 4;
  const size = 12 + headLen + count * 12 + Math.ceil((count * 2) / 4) * 4;
  const buf = new ArrayBuffer(size);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, count, true);
  dv.setUint32(8, headLen, true);
  new Uint8Array(buf, 12, head.length).set(head);
  new Uint8Array(buf, 12 + head.length, headLen - head.length).fill(0x20);
  let o = 12 + headLen;
  for (const a of [lat, lon, weight]) {
    new Float32Array(buf, o, count).set(a);
    o += count * 4;
  }
  new Uint16Array(buf, o, count).set(country);
  return new Uint8Array(buf);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const bin = encodePhotoIndex(readFileSync(join(root, 'public', 'data', 'cities.tsv'), 'utf8'));
  writeFileSync(join(root, 'public', 'data', 'photo-index.bin'), bin);
  console.log(`photo-index.bin: ${(bin.length / 1024 / 1024).toFixed(1)} MB`);
}
