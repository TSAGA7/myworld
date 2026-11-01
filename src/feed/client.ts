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
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    fetch(`${FEED_BASE}${name}.json?t=${Math.floor(Date.now() / 120_000)}`)
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
      .catch(() => alive && setStatus('offline'));
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
