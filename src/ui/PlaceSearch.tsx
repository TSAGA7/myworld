import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorld } from '../app/world';
import type { CatalogCity } from '../domain/search';
import { indexItems, search } from '../domain/search';
import type { CountryRef } from '../domain/world';
import { type Catalog, loadCatalog } from '../geo/catalog';
import { COUNTRY_BY_ID, countryName, searchCountries } from '../geo/reference';
import type { City } from '../domain/model';
import { Icon } from './Icon';
import { Flag } from './kit';

export type PickedCity = { kind: 'catalog'; city: CatalogCity } | { kind: 'saved'; city: City };

/**
 * Search box with suggestions from the bundled catalogs (works offline):
 * countries, catalog cities (Russian and English names), and cities the user created.
 */
export function PlaceSearch({
  onCountry,
  onCity,
  onCustom,
  countryFilter,
  placeholder = 'Страна или город',
  autoFocus = true,
  withCountries = true,
}: {
  onCountry?: (c: CountryRef) => void;
  onCity: (c: PickedCity) => void;
  /** Offered when nothing fits: create a city by hand with the typed name. */
  onCustom?: (name: string) => void;
  countryFilter?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  withCountries?: boolean;
}) {
  const { cities, world } = useWorld();
  const [q, setQ] = useState('');
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadCatalog().then(
      (c) => alive && setCatalog(c),
      (e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (autoFocus) window.setTimeout(() => input.current?.focus(), 250);
  }, [autoFocus]);

  const custom = useMemo(() => [...cities.values()].filter((c) => c.source === 'custom'), [cities]);
  const customIndex = useMemo(() => indexItems(custom, (c) => [c.name, c.nameEn]), [custom]);

  const countryHits = withCountries && q.trim() ? searchCountries(q, 4).filter((c) => !countryFilter || c.id === countryFilter) : [];
  const customHits = q.trim() ? search(customIndex, q, 4).filter((c) => !countryFilter || c.countryId === countryFilter) : [];
  const cityHits = q.trim() && catalog ? catalog.search(q, 10, countryFilter ?? undefined) : [];

  const nothing = q.trim().length > 1 && catalog && countryHits.length + customHits.length + cityHits.length === 0;

  return (
    <div className="stack">
      <label className="search">
        <Icon name="search" size={20} />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {q && (
          <button type="button" className="icon-plain" onClick={() => setQ('')} aria-label="Очистить">
            <Icon name="close" size={18} />
          </button>
        )}
      </label>
      {error && <div className="banner warn">Справочник городов не загрузился: {error}</div>}
      {!catalog && !error && q && (
        <div className="row muted small">
          <span className="spinner" /> Загружаю справочник городов…
        </div>
      )}
      {(countryHits.length > 0 || customHits.length > 0 || cityHits.length > 0) && (
        <div className="list">
          {countryHits.map((c) => (
            <button key={c.id} type="button" className="list-row" onClick={() => onCountry?.(c)}>
              <Flag id={c.id} />
              <span className="grow">
                <span className="t">{c.ru}</span>
                <span className="s block">Страна, {c.continent}</span>
              </span>
              <StatusDot status={world.countryStatus.get(c.id)} />
            </button>
          ))}
          {customHits.map((c) => (
            <button key={c.id} type="button" className="list-row" onClick={() => onCity({ kind: 'saved', city: c })}>
              <Flag id={c.countryId} />
              <span className="grow">
                <span className="t">{c.name}</span>
                <span className="s block">
                  {countryName(c.countryId)}, добавлен вами{c.lat === null ? ', без координат' : ''}
                </span>
              </span>
              <StatusDot status={world.cityStatus.get(c.id)} />
            </button>
          ))}
          {cityHits.map((c) => (
            <button key={c.id} type="button" className="list-row" onClick={() => onCity({ kind: 'catalog', city: c })}>
              <span className="city-dot" aria-hidden="true">
                <Icon name="pin" size={18} />
              </span>
              <span className="grow">
                <span className="t">{c.ru}</span>
                <span className="s block ellipsis">
                  {COUNTRY_BY_ID.get(c.countryId)?.ru ?? c.countryId}
                  {c.region && c.region !== c.en ? `, ${c.region}` : ''}
                  {c.en && c.en !== c.ru ? ` (${c.en})` : ''}
                </span>
              </span>
              <StatusDot status={world.cityStatus.get(c.id)} />
            </button>
          ))}
        </div>
      )}
      {nothing && <p className="muted small" style={{ margin: '0 4px' }}>Ничего не найдено. Проверьте написание или добавьте город вручную.</p>}
      {onCustom && q.trim().length > 1 && catalog && (
        <button type="button" className="btn ghost" onClick={() => onCustom(q.trim())}>
          <Icon name="plus" size={18} /> Добавить «{q.trim()}» вручную
        </button>
      )}
    </div>
  );
}

function StatusDot({ status }: { status?: 'visited' | 'planned' | 'none' }) {
  if (!status || status === 'none') return null;
  return <span className={`status-dot ${status}`} aria-label={status === 'visited' ? 'посещено' : 'запланировано'} />;
}
