/**
 * Line breaking for text drawn on a canvas (share card). `measure` returns the width of a string in the current font.
 * Words are kept whole; a single word wider than the line is cut with «…» as the last resort.
 */
export function wrapText(measure: (s: string) => number, text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next) <= max || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.map((l) => (measure(l) <= max ? l : clip(measure, l, max)));
}

export function clip(measure: (s: string) => number, text: string, max: number): string {
  if (measure(text) <= max) return text;
  let t = text;
  while (t.length > 1 && measure(`${t}…`) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * The largest font (from `sizes`, big to small) at which the text takes at most `maxLines` lines. If even the smallest
 * needs more, the text is cut on the last line — the caller makes that practically impossible with short texts.
 */
export function fitLines(
  measureAt: (size: number) => (s: string) => number,
  text: string,
  max: number,
  sizes: readonly number[],
  maxLines: number,
): { size: number; lines: string[] } {
  for (const size of sizes) {
    const lines = wrapText(measureAt(size), text, max);
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1] ?? 30;
  const m = measureAt(size);
  const lines = wrapText(m, text, max);
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = clip(m, `${kept[maxLines - 1] ?? ''} ${lines.slice(maxLines).join(' ')}`, max);
  return { size, lines: kept };
}
