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

  // Places sharing a name in one region (three «Верея» near Moscow) get «у Наро-Фоминска · 12 км».
  const twins = new Set<string>();
  {
    const seen = new Map<string, number>();
    for (const c of cityHits) seen.set(`${c.ru}|${c.regionId}`, (seen.get(`${c.ru}|${c.regionId}`) ?? 0) + 1);
    for (const c of cityHits) if ((seen.get(`${c.ru}|${c.regionId}`) ?? 0) > 1) twins.add(c.id);
  }
  const nearLabel = (c: CatalogCity): string => {
    if (!catalog || !twins.has(c.id)) return '';
    const n = catalog.near(c);
    if (!n) return '';
    return ` · рядом ${n.city.ru}, ${Math.max(1, n.km)} км`;
  };

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
        <div className="list" data-keep-keyboard>
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
            <button key={c.id} type="button" className="list-row" aria-pressed={world.cityStatus.get(c.id) === 'visited'} onClick={() => onCity({ kind: 'saved', city: c })}>
              <CityMark status={world.cityStatus.get(c.id)} />
              <span className="grow">
                <span className="t block ellipsis">{c.name}</span>
                <span className="s block">
                  {countryName(c.countryId)}, добавлен вами{c.lat === null ? ', без координат' : ''}
                </span>
              </span>
            </button>
          ))}
          {cityHits.map((c) => {
            const st = world.cityStatus.get(c.id);
            return (
              <button key={c.id} type="button" className="list-row" aria-pressed={st === 'visited'} onClick={() => onCity({ kind: 'catalog', city: c })}>
                <CityMark status={st} />
                <span className="grow">
                  <span className="t block ellipsis">{c.ru}</span>
                  <span className="s block ellipsis">
                    {st === 'visited' ? 'Отмечен · ' : st === 'planned' ? 'В планах · ' : ''}
                    {COUNTRY_BY_ID.get(c.countryId)?.ru ?? c.countryId}
                    {c.region && c.region !== c.en ? `, ${c.region}` : ''}
                    {twins.has(c.id) ? nearLabel(c) : c.en && c.en !== c.ru ? ` (${c.en})` : ''}
                  </span>
                </span>
              </button>
            );
          })}
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

/** Left mark of a city row: a pin, or a big lime tick once the city is marked — visible however long the name. */
function CityMark({ status }: { status?: 'visited' | 'planned' | 'none' }) {
  if (status === 'visited')
    return (
      <span className="city-mark on" aria-label="посещено">
        <Icon name="check" size={18} />
      </span>
    );
  if (status === 'planned') return <span className="city-mark planned" aria-label="запланировано" />;
  return (
    <span className="city-dot" aria-hidden="true">
      <Icon name="pin" size={18} />
    </span>
  );
}

function StatusDot({ status }: { status?: 'visited' | 'planned' | 'none' }) {
  if (!status || status === 'none') return null;
  return <span className={`status-dot ${status}`} aria-label={status === 'visited' ? 'посещено' : 'запланировано'} />;
}
