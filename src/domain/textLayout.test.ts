import { describe, expect, it } from 'vitest';
import { clip, fitLines, wrapText } from './textLayout';

// One unit per character: easy to reason about.
const m = (s: string) => s.length;
const at = (size: number) => (s: string) => (s.length * size) / 10;

describe('text layout for the share card', () => {
  it('wraps by words and never cuts a fitting text', () => {
    expect(wrapText(m, 'Самая северная точка — Мурманск, 69° с. ш.', 22)).toEqual(['Самая северная точка —', 'Мурманск, 69° с. ш.']);
    expect(wrapText(m, 'коротко', 20)).toEqual(['коротко']);
  });
  it('picks the largest size that fits the lines, cuts only as the last resort', () => {
    const t = 'Больше всего городов — Московская область: 12';
    expect(fitLines(at, t, 100, [38, 34, 31], 2)).toEqual({ size: 38, lines: ['Больше всего городов —', 'Московская область: 12'] });
    expect(fitLines(at, t, 60, [38, 34], 1).lines[0]?.endsWith('…')).toBe(true);
    expect(clip(m, 'abcdef', 4)).toBe('abc…');
  });
});
