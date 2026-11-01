import { describe, expect, it } from 'vitest';
import { makePdf } from './pdf';

describe('pdf', () => {
  it('writes a valid xref for image pages', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
    const bytes = makePdf([{ jpeg, width: 10, height: 14 }, { jpeg, width: 10, height: 14 }], 'Путеводитель');
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // Every xref offset points at "n 0 obj".
    const xrefAt = Number(text.match(/startxref\n(\d+)/)?.[1]);
    const rows = text.slice(xrefAt).split('\n').slice(3, 3 + 9);
    rows.forEach((r, i) => expect(text.slice(Number(r.slice(0, 10)), Number(r.slice(0, 10)) + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });
});
