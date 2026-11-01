import { useRef, type TouchEvent } from 'react';

/** Elements that take their own gestures: a swipe starting on them is theirs, not a tab change. */
const OWN_GESTURE = '.sheet, .scrim, input, textarea, select, svg.home-map, .maplibregl-canvas, [data-noswipe]';

/** A row that really scrolls sideways right now (a long chip row), not just any element styled as chips. */
function scrollsSideways(el: Element | null): boolean {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth + 2) {
      const o = getComputedStyle(e).overflowX;
      if (o === 'auto' || o === 'scroll') return true;
    }
  }
  return false;
}

/**
 * Left/right swipe between tabs, tuned for iPhone: the direction is locked on the first ~10 px, a short quick flick
 * counts as well as a long slow drag, and a gesture iOS cancels midway (touchcancel) still finishes from the last point.
 * Pair with `touch-action: pan-y` on the element so vertical scrolling stays native and horizontal moves reach us.
 */
export function useSwipe(onSwipe: (dir: 1 | -1) => void, enabled = true) {
  const g = useRef<{ x: number; y: number; t: number; lx: number; ly: number; lock: 'x' | 'y' | null } | null>(null);
  const finish = () => {
    const s = g.current;
    g.current = null;
    if (!s || s.lock !== 'x' || !enabled) return;
    const dx = s.lx - s.x;
    const dy = s.ly - s.y;
    const ms = Math.max(1, Date.now() - s.t);
    const fast = Math.abs(dx) / ms > 0.25;
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (Math.abs(dx) >= 45 || (fast && Math.abs(dx) >= 24)) onSwipe(dx < 0 ? 1 : -1);
  };
  return {
    onTouchStart: (e: TouchEvent) => {
      const p = e.touches[0];
      const own = e.target instanceof Element && (!!e.target.closest(OWN_GESTURE) || scrollsSideways(e.target));
      g.current = p && e.touches.length === 1 && !own ? { x: p.clientX, y: p.clientY, t: Date.now(), lx: p.clientX, ly: p.clientY, lock: null } : null;
    },
    onTouchMove: (e: TouchEvent) => {
      const s = g.current;
      const p = e.touches[0];
      if (!s || !p) return;
      if (e.touches.length > 1) {
        g.current = null;
        return;
      }
      s.lx = p.clientX;
      s.ly = p.clientY;
      if (!s.lock) {
        const ax = Math.abs(s.lx - s.x);
        const ay = Math.abs(s.ly - s.y);
        if (ax > 10 || ay > 10) s.lock = ax > ay ? 'x' : 'y';
      }
    },
    onTouchEnd: (e: TouchEvent) => {
      const s = g.current;
      const p = e.changedTouches[0];
      if (s && p) {
        s.lx = p.clientX;
        s.ly = p.clientY;
        if (!s.lock && Math.abs(s.lx - s.x) > Math.abs(s.ly - s.y)) s.lock = 'x';
      }
      finish();
    },
    onTouchCancel: finish,
  };
}
