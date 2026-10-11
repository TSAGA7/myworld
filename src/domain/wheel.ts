/** Physics of the trips wheel: a flung wheel coasts with friction, then a critically damped spring lands it on a card. */
export interface WheelState {
  pos: number;
  vel: number;
  target: number | null;
}

export const FRICTION = 2.2; // 1/s
const SPRING = 90;

/** Advances the wheel by `dt` seconds (keep dt small, ≤ 1/60). Returns true when it has come to rest on a card. */
export function wheelStep(s: WheelState, dt: number, n: number): boolean {
  if (s.target === null && Math.abs(s.vel) > 0.8) {
    s.pos += s.vel * dt;
    s.vel *= Math.exp(-FRICTION * dt);
    return false;
  }
  if (s.target === null) s.target = Math.round(s.pos + s.vel * 0.15);
  const acc = -SPRING * (s.pos - s.target) - 2 * Math.sqrt(SPRING) * s.vel;
  s.vel += acc * dt;
  s.pos += s.vel * dt;
  if (Math.abs(s.pos - s.target) < 0.001 && Math.abs(s.vel) < 0.01) {
    s.pos = ((s.target % n) + n) % n;
    s.target = null;
    s.vel = 0;
    return true;
  }
  return false;
}
