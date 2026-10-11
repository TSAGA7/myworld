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

/**
 * Where card `i` sits relative to the front when the wheel is at `pos`: 0 = front, 1..n-1 = peeking behind,
 * negative (down to -0.5) = leaving the front downwards. The wrap point is at half a card, so a card that is
 * settling into the back slot (d slightly above n-1) is never mistaken for one that is leaving.
 */
export function wheelOffset(i: number, pos: number, n: number): number {
  let d = (((i - pos) % n) + n) % n;
  if (n > 1 && d > n - 0.5) d -= n;
  return d;
}

export interface CardPose {
  top: number;
  scale: number;
  opacity: number;
  tilt: number;
  z: number;
}

/** Pose of a card at offset `d` in a stack with `behind` cards peeking `peek` px above the front one. */
export function cardPose(d: number, n: number, behind: number, peek: number): CardPose {
  let pose: CardPose;
  if (d < 0) {
    // leaving the front: slides down, tilts away and fades out by the time it is half way
    pose = { top: behind * peek - d * 180, scale: 1 + d * 0.08, opacity: Math.max(0, 1 + 2 * d), tilt: d * 56, z: 200 };
  } else if (d <= behind) {
    pose = { top: (behind - d) * peek, scale: 1 - d * 0.05, opacity: 1, tilt: 0, z: 100 - Math.round(d * 10) };
  } else if (d < behind + 1) {
    pose = { top: (behind - d) * peek, scale: 1 - d * 0.05, opacity: behind + 1 - d, tilt: 0, z: 10 };
  } else {
    pose = { top: -peek, scale: 0.8, opacity: 0, tilt: 0, z: 0 };
  }
  // the card just arriving at (or leaving) the far end of the wheel fades in/out there instead of popping
  if (n > 1 && d > n - 1) pose.opacity *= Math.max(0, 1 - (d - (n - 1)) * 2);
  return pose;
}

export const DRAG_PX = 120; // finger travel that turns the wheel by one card

/** Wheel position while dragging: the stack follows the finger (finger up → cards go up). */
export const dragPos = (startPos: number, dy: number) => startPos + dy / DRAG_PX;

/**
 * Fits the stack between its top edge and the bottom bar: `avail` px of height. Prefers 3 peeking cards,
 * drops to fewer on short screens so the front card keeps a usable height.
 */
export function fitWallet(avail: number, n: number): { behind: number; peek: number; cardH: number } {
  const MIN = 270;
  const MAX = 470;
  const peek = 56;
  let behind = Math.min(3, Math.max(0, n - 1));
  while (behind > 1 && avail - behind * peek < MIN) behind--;
  const cardH = Math.round(Math.max(MIN - 30, Math.min(MAX, avail - behind * peek)));
  return { behind, peek, cardH };
}
