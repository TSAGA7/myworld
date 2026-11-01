import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Folder with the published files: the checkout of the `data` branch + "/feed" (FEED_DIR, default ./feed-data/feed). */
export const FEED_DIR = process.env.FEED_DIR ?? join(process.cwd(), 'feed-data', 'feed');

export function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(join(FEED_DIR, name), 'utf8')) as T;
  } catch {
    return null;
  }
}

export function writeJson(name: string, data: unknown, pretty = false): void {
  const path = join(FEED_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, pretty ? 1 : 0)}\n`);
}

const UA = 'Mozilla/5.0 (compatible; MyWorldFeed/1.0; +https://tsaga7.github.io/myworld/)';

export async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<string> {
  const r = await fetch(url, { ...init, headers: { 'user-agent': UA, 'accept-language': 'ru,en;q=0.8', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
