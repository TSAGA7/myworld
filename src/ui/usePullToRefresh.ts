import { type RefObject, useEffect, useRef, useState } from 'react';

const TRIGGER = 72;
const MAX = 120;

export interface Pull {
  /** How far the content is pulled down, px. */
  y: number;
  /** Past the point where releasing refreshes. */
  armed: boolean;
  refreshing: boolean;
  /** The finger is on the screen: the page follows it without animation. */
  dragging: boolean;
}

/**
 * Pull down at the very top of a scrolling screen to refresh (iOS-style). The page follows the finger with resistance;
 * a sideways gesture is left to the tab swipe. `refresh` resolves when the new data is in.
 */
export function usePullToRefresh(ref: RefObject<HTMLElement>, refresh: () => Promise<unknown>, enabled = true): Pull {
  const [state, setState] = useState<Pull>({ y: 0, armed: false, refreshing: false, dragging: false });
  const run = useRef(refresh);
  run.current = refresh;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let startY = 0;
    let startX = 0;
    let y = 0;
    let mode: 'idle' | 'maybe' | 'pull' | 'off' = 'idle';
    let busy = false;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      const target = e.target as HTMLElement;
      mode = !t || busy || e.touches.length > 1 || el.scrollTop > 0 || target.closest('input, textarea, .chips, .sheet') ? 'off' : 'maybe';
      if (t) {
        startY = t.clientY;
        startX = t.clientX;
      }
      y = 0;
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || mode === 'off' || mode === 'idle') return;
      const dy = t.clientY - startY;
      const dx = t.clientX - startX;
      if (mode === 'maybe') {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || el.scrollTop > 0) {
          mode = 'off';
          return;
        }
        mode = 'pull';
      }
      e.preventDefault();
      // Resistance: the further, the harder.
      y = Math.min(MAX, Math.max(0, dy) * 0.5);
      setState({ y, armed: y >= TRIGGER, refreshing: false, dragging: true });
    };
    const end = () => {
      if (mode === 'pull') {
        if (y >= TRIGGER) {
          busy = true;
          setState({ y: 56, armed: true, refreshing: true, dragging: false });
          const minWait = new Promise((r) => window.setTimeout(r, 600));
          void Promise.allSettled([run.current(), minWait]).then(() => {
            busy = false;
            setState({ y: 0, armed: false, refreshing: false, dragging: false });
          });
        } else setState({ y: 0, armed: false, refreshing: false, dragging: false });
      }
      mode = 'idle';
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [ref, enabled]);
  return state;
}
