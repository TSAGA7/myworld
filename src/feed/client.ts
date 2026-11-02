import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { ResortStatusFileSchema, type ResortStatusFile } from './resortStatus';
import type { ZodType } from 'zod';
import { DealsFileSchema, DigestFileSchema, InterestingFileSchema, NewsFileSchema, TranslationsFileSchema, type DealsFile, type DigestFile, type InterestingFile, type NewsFile, type TranslationsFile } from './schema';

/** Published by .github/workflows/feed.yml and the daily digest task (branch `data`). */
export const FEED_BASE = 'https://raw.githubusercontent.com/TSAGA7/myworld/data/feed/';
/** Supabase function for a live price check (supabase/functions/price-check); empty until it is deployed. */
export const PRICE_CHECK_URL: string = import.meta.env.VITE_PRICE_CHECK_URL ?? '';
export const PRICE_CHECK_KEY: string = import.meta.env.VITE_PRICE_CHECK_KEY ?? '';

export type FeedName = 'news' | 'digest' | 'deals' | 'translations' | 'interesting' | 'resort-status';
type FileOf = { news: NewsFile; digest: DigestFile; deals: DealsFile; translations: TranslationsFile; interesting: InterestingFile; 'resort-status': ResortStatusFile };
const SCHEMA: { [K in FeedName]: ZodType<FileOf[K]> } = {
  news: NewsFileSchema,
  digest: DigestFileSchema,
  deals: DealsFileSchema,
  translations: TranslationsFileSchema,
  interesting: InterestingFileSchema,
  'resort-status': ResortStatusFileSchema,
};

const storeKey = (n: FeedName) => `mw-feed-${n}`;
function readSaved<K extends FeedName>(name: K): FileOf[K] | null {
  try {
    const raw = localStorage.getItem(storeKey(name));
    const r = raw ? SCHEMA[name].safeParse(JSON.parse(raw)) : null;
    return r?.success ? r.data : null;
  } catch {
    return null;
  }
}

export const FEED_REFRESH = 'mw-feed-refresh';
const FEED_LOADED = 'mw-feed-loaded';
/** Starts the collector right away (supabase/functions/feed-kick → .github/workflows/feed.yml). */
export const FEED_KICK_URL = 'https://gpnpqwyniqmdinwazegh.supabase.co/functions/v1/feed-kick';

/** Reloads every feed file on screen; resolves when one of them is in (or after 8 s). */
function reloadOpenFiles(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener(FEED_LOADED, done);
      window.clearTimeout(t);
      resolve();
    };
    const t = window.setTimeout(done, 8000);
    window.addEventListener(FEED_LOADED, done);
    window.dispatchEvent(new Event(FEED_REFRESH));
  });
}

/** Time of the newest published file (news / deals): what «Обновлено N назад» shows. */
async function publishedAt(): Promise<string | null> {
  const got = await Promise.all(
    (['news', 'deals'] as const).map((n) =>
      fetch(`${FEED_BASE}${n}.json?t=${Date.now()}`, { cache: 'no-store' })
        .then((r) => (r.ok ? (r.json() as Promise<{ updatedAt?: string }>) : null))
        .then((j) => j?.updatedAt ?? null)
        .catch(() => null),
    ),
  );
  return got.filter((x): x is string => !!x).sort().pop() ?? null;
}

/**
 * What a pull-to-refresh did, shown under the tabs so it is never a silent «nothing happened»:
 *  checking   — downloading the latest published copy;
 *  collecting — a new collection run was started, waiting for it (about 1–3 min);
 *  fresh      — new data arrived;
 *  same       — the copy is already the latest: the next collection has not run yet;
 *  offline    — no connection.
 */
export type PullPhase = 'idle' | 'checking' | 'collecting' | 'fresh' | 'same' | 'offline';
export interface PullStatus {
  phase: PullPhase;
  /** When the published data was collected. */
  publishedAt: string | null;
  /** When the phone last checked. */
  checkedAt: string | null;
  /** The collector cannot be started from the app (server part not set up, or a run was started a few minutes ago). */
  note: string | null;
}
let pull: PullStatus = { phase: 'idle', publishedAt: null, checkedAt: null, note: null };
const pullListeners = new Set<() => void>();
const setPull = (p: Partial<PullStatus>) => {
  pull = { ...pull, ...p };
  pullListeners.forEach((l) => l());
};
export function usePullStatus(): PullStatus {
  return useSyncExternalStore(
    (l) => {
      pullListeners.add(l);
      return () => pullListeners.delete(l);
    },
    () => pull,
  );
}

type Kick = { started: boolean; reason?: string; retryAt?: string };
async function kick(): Promise<Kick> {
  try {
    const r = await fetch(FEED_KICK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'pull' }) });
    if (r.status === 404) return { started: false, reason: 'not_configured' };
    return (await r.json()) as Kick;
  } catch {
    return { started: false, reason: 'unavailable' };
  }
}

const POLL_MS = 20_000;
const WAIT_MS = 5 * 60_000;

/**
 * «Потянуть ленту вниз»: downloads the latest copy past every cache, asks the server to collect right now, and when it
 * did, waits for the new copy (checking every 20 s up to 5 min). The result is in usePullStatus().
 */
export async function refreshFeed(): Promise<void> {
  if (pull.phase === 'checking' || pull.phase === 'collecting') return;
  const before = pull.publishedAt;
  setPull({ phase: 'checking', note: null });
  const [, at, k] = await Promise.all([reloadOpenFiles(), publishedAt(), kick()]);
  const now = new Date().toISOString();
  if (!at) {
    setPull({ phase: 'offline', checkedAt: now });
    return;
  }
  const changed = !!before && at > before;
  setPull({ publishedAt: at, checkedAt: now });
  if (k.started) {
    setPull({ phase: 'collecting' });
    void waitForNew(at);
    return;
  }
  const note =
    k.reason === 'recent'
      ? `Сбор уже запускали несколько минут назад${k.retryAt ? ` — снова можно в ${new Date(k.retryAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : ''}`
      : k.reason === 'not_configured' || k.reason === 'unavailable'
        ? 'Запустить новый сбор из приложения пока нельзя — показана последняя опубликованная версия'
        : 'Сервер сбора не ответил — показана последняя опубликованная версия';
  setPull({ phase: changed ? 'fresh' : 'same', note });
}

async function waitForNew(since: string): Promise<void> {
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    await new Promise((r) => window.setTimeout(r, POLL_MS));
    const at = await publishedAt();
    if (at && at > since) {
      await reloadOpenFiles();
      setPull({ phase: 'fresh', publishedAt: at, checkedAt: new Date().toISOString(), note: null });
      return;
    }
    setPull({ checkedAt: new Date().toISOString() });
  }
  setPull({ phase: 'same', note: 'Сбор идёт дольше обычного — новые данные появятся сами' });
}

/** The status line learns the publication time from any loaded file. */
export function notePublished(at: string | undefined): void {
  if (at && (!pull.publishedAt || at > pull.publishedAt)) setPull({ publishedAt: at });
}

export type FeedState<T> = {
  data: T | null;
  /** 'missing' = the file is not published yet (e.g. the scanner has no key yet). */
  status: 'loading' | 'ok' | 'missing' | 'offline';
  reload: () => void;
};

/** Last published file; the previous copy is shown at once and works offline. */
export function useFeedFile<K extends FeedName>(name: K): FeedState<FileOf[K]> {
  const [data, setData] = useState<FileOf[K] | null>(() => readSaved(name));
  const [status, setStatus] = useState<FeedState<FileOf[K]>['status']>('loading');
  const [tick, setTick] = useState(0);
  // «Pull to refresh» in the feed: every open file reloads, past the CDN copy.
  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(FEED_REFRESH, on);
    return () => window.removeEventListener(FEED_REFRESH, on);
  }, []);
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    // A forced reload asks for a fresh copy; otherwise the same URL for two minutes (cheap, cached).
    const bust = tick > 0 ? `${Date.now()}` : `${Math.floor(Date.now() / 120_000)}`;
    fetch(`${FEED_BASE}${name}.json?t=${bust}`, tick > 0 ? { cache: 'no-store' } : undefined)
      .then(async (r) => {
        if (r.status === 404) return 'missing' as const;
        if (!r.ok) throw new Error(String(r.status));
        const parsed = SCHEMA[name].safeParse(await r.json());
        if (!parsed.success) throw new Error('format');
        if (!alive) return 'ok' as const;
        setData(parsed.data);
        try {
          localStorage.setItem(storeKey(name), JSON.stringify(parsed.data));
        } catch {
          /* storage full or blocked: the file is still shown */
        }
        return 'ok' as const;
      })
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus('offline'))
      .finally(() => window.dispatchEvent(new Event(FEED_LOADED)));
    return () => {
      alive = false;
    };
  }, [name, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, status, reload };
}

export interface LiveCheck {
  price: number | null;
  departAt: string | null;
  transfers: number | null;
  link: string | null;
  checkedAt: string;
}

export async function checkPrice(origin: string, destination: string, date: string): Promise<LiveCheck> {
  const q = new URLSearchParams({ origin, destination, date });
  const headers: Record<string, string> = PRICE_CHECK_KEY ? { apikey: PRICE_CHECK_KEY, authorization: `Bearer ${PRICE_CHECK_KEY}` } : {};
  const r = await fetch(`${PRICE_CHECK_URL}?${q}`, { headers, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Сервис проверки ответил ${r.status}`);
  return (await r.json()) as LiveCheck;
}
