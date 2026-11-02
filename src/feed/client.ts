import { useCallback, useEffect, useState } from 'react';
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

/** Reloads every feed file on screen; resolves when one of them is in (or after 8 s). */
export function refreshFeed(): Promise<void> {
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
