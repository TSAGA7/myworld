import { useSyncExternalStore } from 'react';

/**
 * "Lean mode" while the photo picker is in use: the 3D globe (the heaviest part of the app, a WebGL scene) is taken
 * down so iOS does not unload the page while its own photo picker is open — an unloaded page loses the selection.
 */
let holders = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function holdLean(): () => void {
  holders++;
  emit();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holders--;
    emit();
  };
}

export const useLean = (): boolean =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => holders > 0,
    () => false,
  );
