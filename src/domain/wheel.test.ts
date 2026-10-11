import { describe, expect, it } from 'vitest';
import { type WheelState, wheelStep } from './wheel';

const run = (s: WheelState, n: number) => {
  let t = 0;
  while (!wheelStep(s, 1 / 120, n) && t < 20) t += 1 / 120;
  return t;
};

describe('trips wheel', () => {
  it('a strong flick spins several cards by inertia, slows down and lands exactly on a card', () => {
    const s: WheelState = { pos: 0, vel: 12, target: null };
    const t = run(s, 7);
    expect(t).toBeGreaterThan(1); // keeps turning for a while
    expect(t).toBeLessThan(5);
    expect(Number.isInteger(s.pos)).toBe(true);
    expect(s.pos).toBe(5); // 12 / 2.2 ≈ 5.5 cards → the 6th (index 5) after wrapping in 7
  });
  it('wraps around: the wheel has no end', () => {
    const s: WheelState = { pos: 0, vel: -12, target: null };
    run(s, 4);
    expect(s.pos).toBeGreaterThanOrEqual(0);
    expect(s.pos).toBeLessThan(4);
  });
  it('a gentle release settles on the nearest card', () => {
    const s: WheelState = { pos: 2.3, vel: 0, target: null };
    run(s, 5);
    expect(s.pos).toBe(2);
  });
});
