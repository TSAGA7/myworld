import { useSyncExternalStore } from 'react';
import { latestRelease, newerItems, parseChangelog, type Release } from '../domain/changes';
import bundled from './changelog.json';

/**
 * App updates. A new version's service worker installs in the background and waits; the user sees what was added
 * and taps «Обновить» (the worker takes over, the page reloads). Until then the old version keeps working from its
 * own cache, so a screen that lazy-loads a chunk never hits a file that is already gone.
 */
export type UpdateState =
  | { kind: 'none' }
  /** A new version is downloaded and waits for «Обновить». */
  | { kind: 'ready'; items: string[] }
  /** The app has just been updated (e.g. after a restart): tell what is new once. */
  | { kind: 'updated'; items: string[] };

const LOCAL: Release[] = parseChangelog(bundled);
export const CURRENT_RELEASE = latestRelease(LOCAL);
const SEEN_KEY = 'mw-seen-release';

let state: UpdateState = { kind: 'none' };
const listeners = new Set<() => void>();
const set = (s: UpdateState) => {
  state = s;
  for (const l of listeners) l();
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useUpdate = (): UpdateState => useSyncExternalStore(subscribe, () => state);

let registration: ServiceWorkerRegistration | null = null;
/** Release number of the version on the server, once known: what «Обновить» has already shown. */
let remoteLatest = 0;

/** What the new version on the server adds compared with this build. Never cached: always the live file. */
export async function remoteNews(): Promise<string[]> {
  try {
    const r = await fetch(`./changelog.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return [];
    const log = parseChangelog(await r.json());
    remoteLatest = Math.max(remoteLatest, latestRelease(log));
    return newerItems(log, CURRENT_RELEASE);
  } catch {
    return [];
  }
}

async function announceReady() {
  if (state.kind === 'ready') return;
  set({ kind: 'ready', items: await remoteNews() });
}

/** Switches to the new version: the waiting worker takes over and the page reloads (or just reloads if none waits). */
export function applyUpdate(): void {
  // The user has just read the list: the new version should not repeat it after the reload.
  if (remoteLatest > CURRENT_RELEASE) markSeen(remoteLatest);
  const waiting = registration?.waiting;
  let done = false;
  const reload = () => {
    if (done) return;
    done = true;
    location.reload();
  };
  if (waiting && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('controllerchange', reload);
    waiting.postMessage('skip-waiting');
    window.setTimeout(reload, 4000);
  } else reload();
}

/** Hides the card until the next check (the update is applied anyway on the next cold start). */
export function dismissUpdate(): void {
  if (state.kind === 'updated') markSeen();
  set({ kind: 'none' });
}

function markSeen(n = CURRENT_RELEASE) {
  try {
    localStorage.setItem(SEEN_KEY, String(n));
  } catch {
    /* private mode: the card may show again, harmless */
  }
}

/** After an update the first launch shows what is new; the very first launch of the app shows nothing. */
function checkJustUpdated() {
  let seen: number | null = null;
  try {
    const v = localStorage.getItem(SEEN_KEY);
    seen = v === null ? null : Number(v);
  } catch {
    return;
  }
  if (seen === null || !Number.isFinite(seen)) return markSeen();
  if (seen >= CURRENT_RELEASE) return;
  const items = newerItems(LOCAL, seen);
  if (items.length) set({ kind: 'updated', items });
  else markSeen();
}

/** Registers the offline worker and watches for new versions (production build only). */
export function startUpdates(): void {
  checkJustUpdated();
  if (!('serviceWorker' in navigator)) return;
  const watch = (reg: ServiceWorkerRegistration) => {
    registration = reg;
    // A worker is already waiting (downloaded during the previous session).
    if (reg.waiting && navigator.serviceWorker.controller) void announceReady();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) void announceReady();
      });
    });
    // iOS keeps a home-screen app alive for days: look for updates whenever it comes back, and every half hour.
    const check = () => void reg.update().catch(() => undefined);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    window.setInterval(check, 30 * 60_000);
  };
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then(watch)
      .catch(() => undefined);
  });
}
