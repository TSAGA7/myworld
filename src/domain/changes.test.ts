import { describe, expect, it } from 'vitest';
import log from '../app/changelog.json';
import { isUpdateError, latestRelease, newerItems, parseChangelog } from './changes';

const sample = [
  { n: 1, date: '2026-10-10', items: ['a', 'b'] },
  { n: 3, date: '2026-10-12', items: ['e'] },
  { n: 2, date: '2026-10-11', items: ['c', 'd', 'a'] },
];

describe('changelog', () => {
  it('lists what is newer than the running build, newest first, without repeats', () => {
    expect(newerItems(sample, 1)).toEqual(['e', 'c', 'd', 'a']);
    expect(newerItems(sample, 3)).toEqual([]);
    expect(newerItems(sample, 0, 2)).toEqual(['e', 'c']);
    expect(latestRelease(sample)).toBe(3);
  });

  it('drops malformed releases from the network', () => {
    expect(parseChangelog({})).toEqual([]);
    expect(parseChangelog([{ n: 1, date: 'x', items: ['ok'] }, { n: '2', items: [] }, null])).toEqual([{ n: 1, date: 'x', items: ['ok'] }]);
  });

  it('the bundled changelog is valid and release numbers are unique', () => {
    const parsed = parseChangelog(log);
    expect(parsed).toHaveLength(log.length);
    expect(new Set(parsed.map((r) => r.n)).size).toBe(parsed.length);
    expect(parsed.every((r) => r.items.length > 0)).toBe(true);
  });

  it('recognises a missing chunk after an update (Safari, Chrome, Firefox)', () => {
    expect(isUpdateError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isUpdateError(new TypeError('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true);
    expect(isUpdateError(new Error('error loading dynamically imported module'))).toBe(true);
    expect(isUpdateError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});
