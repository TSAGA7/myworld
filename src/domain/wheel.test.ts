import { describe, expect, it } from 'vitest';
import { type WheelState, cardPose, dragPos, fitWallet, wheelOffset, wheelStep } from './wheel';

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

describe('trips wheel geometry', () => {
  it('the stack follows the finger: dragging up turns the front card up into the stack', () => {
    const pos = dragPos(0, -60); // finger moved up
    const n = 4;
    const front = cardPose(wheelOffset(0, pos, n), n, 3, 56);
    const atRest = cardPose(0, n, 3, 56);
    expect(front.top).toBeLessThan(atRest.top);
    // and dragging down pushes it down
    const down = cardPose(wheelOffset(0, dragPos(0, 30), n), n, 3, 56);
    expect(down.top).toBeGreaterThan(atRest.top);
  });
  it('the card settling into the back slot stays visible (no blank slot while the spring finishes)', () => {
    const n = 4;
    for (const pos of [0.999, 0.9995, 1, 1.0005]) {
      const p = cardPose(wheelOffset(0, pos, n), n, 3, 56); // card 0 went to the back
      expect(p.opacity).toBeGreaterThan(0.95);
      expect(p.top).toBeLessThan(5);
    }
  });
  it('all visible cards stay inside the space above the bottom bar', () => {
    for (const avail of [380, 450, 520, 700]) {
      const f = fitWallet(avail, 5);
      expect(f.behind * f.peek + f.cardH).toBeLessThanOrEqual(Math.max(avail, 240 + f.peek));
      expect(f.cardH).toBeGreaterThanOrEqual(240);
    }
    expect(fitWallet(700, 5).behind).toBe(3);
    expect(fitWallet(400, 5).behind).toBe(2);
  });
});
