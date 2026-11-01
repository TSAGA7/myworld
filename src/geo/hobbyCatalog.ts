import { useEffect, useState } from 'react';
import { db } from '../app/world';
import { indexPlaces, type Resort, resortsFileSchema, type Spot, spotsFileSchema } from '../domain/hobby';

/**
 * Ski resorts and surf spots are published by .github/workflows/catalog.yml to the `data` branch, so the catalogs
 * grow without an app release. The last downloaded copy is kept in IndexedDB (table `catalog`) and works offline.
 */
export const CATALOG_BASE = 'https://raw.githubusercontent.com/TSAGA7/myworld/data/catalog/';

export type CatalogName = 'resorts' | 'spots';
type ItemOf = { resorts: Resort; spots: Spot };
const SCHEMA = { resorts: resortsFileSchema, spots: spotsFileSchema } as const;

export interface CatalogState<T> {
  items: T[];
  index: Map<string, T>;
  generatedAt: string | null;
  attribution: string;
  /** loading — nothing to show yet; ok — fresh copy; offline — saved copy (or none) and the download failed; missing — not published yet. */
  status: 'loading' | 'ok' | 'offline' | 'missing';
}

const memory = new Map<CatalogName, CatalogState<Resort | Spot>>();
const inflight = new Map<CatalogName, Promise<void>>();
const listeners = new Map<CatalogName, Set<() => void>>();

const empty = <T,>(status: CatalogState<T>['status']): CatalogState<T> => ({ items: [], index: new Map(), generatedAt: null, attribution: '', status });

function build<K extends CatalogName>(name: K, raw: unknown, status: CatalogState<ItemOf[K]>['status']): CatalogState<ItemOf[K]> | null {
  const r = SCHEMA[name].safeParse(raw);
  if (!r.success) return null;
  const items = r.data.items as ItemOf[K][];
  return { items, index: indexPlaces(items), generatedAt: r.data.generatedAt, attribution: r.data.attribution, status };
}

function publish(name: CatalogName, st: CatalogState<Resort | Spot>) {
  memory.set(name, st);
  listeners.get(name)?.forEach((l) => l());
}

async function load(name: CatalogName): Promise<void> {
  const saved = await db.catalog.get(name).catch(() => undefined);
  const fromSaved = saved ? build(name, saved.data, 'loading') : null;
  if (fromSaved && !memory.get(name)?.items.length) publish(name, fromSaved);
  try {
    const r = await fetch(`${CATALOG_BASE}${name}.json?t=${Math.floor(Date.now() / 3_600_000)}`);
    if (r.status === 404) {
      publish(name, fromSaved ? { ...fromSaved, status: 'offline' } : empty('missing'));
      return;
    }
    if (!r.ok) throw new Error(String(r.status));
    const json: unknown = await r.json();
    const fresh = build(name, json, 'ok');
    if (!fresh) throw new Error('format');
    publish(name, fresh);
    await db.catalog.put({ name, data: json, at: new Date().toISOString() }).catch(() => undefined);
  } catch {
    publish(name, fromSaved ? { ...fromSaved, status: 'offline' } : empty('offline'));
  }
}

/** Catalog for a hobby screen; `enabled` = false does not download anything (hobby is off). */
export function useCatalog<K extends CatalogName>(name: K, enabled = true): CatalogState<ItemOf[K]> {
  const [, force] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const set = listeners.get(name) ?? new Set();
    listeners.set(name, set);
    const l = () => force((n) => n + 1);
    set.add(l);
    if (!inflight.has(name)) {
      const p = load(name);
      inflight.set(name, p);
    }
    return () => {
      set.delete(l);
    };
  }, [name, enabled]);
  return (memory.get(name) as CatalogState<ItemOf[K]> | undefined) ?? empty('loading');
}

/** «Обновить» after an error: downloads the catalog again. */
export function reloadCatalog(name: CatalogName): void {
  const p = load(name);
  inflight.set(name, p);
}
