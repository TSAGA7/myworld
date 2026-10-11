import { useSyncExternalStore } from 'react';

/** Hash routes: #/planet, #/countries, #/countries/IT, #/trips, #/trips/new, #/trips/<id>, #/trips/<id>/edit. */
export const parseHash = (hash: string): string[] => hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): string[] {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash, () => '');
  const seg = parseHash(hash);
  return seg.length === 0 ? ['planet'] : seg;
}

export const go = (path: string, replace = false): void => {
  const url = `#/${path}`;
  if (replace) window.location.replace(url);
  else window.location.hash = url;
};

export const goBack = (fallback: string): void => {
  if (window.history.length > 1) window.history.back();
  else go(fallback, true);
};

/** Request from another tab: focus the map on a place. Read once by the planet screen. */
export type MapFocus = { kind: 'city' | 'country' | 'trip' | 'relocate'; id: string };
let pendingFocus: MapFocus | null = null;
const focusListeners = new Set<() => void>();
export const focusOnMap = (f: MapFocus): void => {
  pendingFocus = f;
  focusListeners.forEach((l) => l());
  go('planet');
};
export const takeFocus = (): MapFocus | null => {
  const f = pendingFocus;
  pendingFocus = null;
  return f;
};
export const onFocusRequest = (l: () => void): (() => void) => {
  focusListeners.add(l);
  return () => focusListeners.delete(l);
};
