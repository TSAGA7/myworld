import { geoAzimuthalEqualArea, geoCentroid, geoPath } from 'd3-geo';
import type { FeatureCollection } from 'geojson';
import { useMemo, useState } from 'react';
import { markCity, unmarkCity } from '../../app/actions';
import { useToast } from '../../app/toast';
import { been, setSetting, useWorld } from '../../app/world';
import { countLabel, plural } from '../../domain/dates';
import type { CatalogCity } from '../../domain/search';
import { catalogToCity } from '../../geo/catalog';
import { COUNTRIES, countryName, searchCountries } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Empty, Flag, Sheet } from '../../ui/kit';
import { PlaceSearch } from '../../ui/PlaceSearch';
import { type Region, useHomeStats } from './homeStats';


/** The home country chosen in settings, or the country of the home city. */
export function useHomeCountry(): string | null {
  const { settings, cities } = useWorld();
  return settings.homeCountryId ?? (settings.homeCityId ? (cities.get(settings.homeCityId)?.countryId ?? null) : null);
}

/**
 * «Моя страна»: how much of their own country the user has seen — regions opened (a region counts once any of its
 * cities is visited), cities, big cities, on a map of regions.
 */
export function HomeCountry() {
  const home = useHomeCountry();
  const [picking, setPicking] = useState(false);
  if (!home || picking) return <PickCountry onDone={() => setPicking(false)} current={home} />;
  return <Tracker countryId={home} onChange={() => setPicking(true)} />;
}

function PickCountry({ onDone, current }: { onDone: () => void; current: string | null }) {
  const [q, setQ] = useState('');
  const quick = ['RU', 'BY', 'KZ', 'UZ', 'AM', 'GE', 'UA', 'KG', 'AZ', 'RS', 'IL', 'DE', 'US', 'TR'].filter((id) => COUNTRIES.some((c) => c.id === id));
  const list = q.trim() ? searchCountries(q, 8).map((c) => c.id) : quick;
  const pick = async (id: string) => {
    await setSetting('homeCountryId', id);
    onDone();
  };
  return (
    <section className="card stack">
      <div className="stack tight">
        <h2 className="h2">Откуда вы?</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Выберите свою страну — приложение будет считать, сколько её регионов и городов вы уже проехали.
        </p>
      </div>
      <label className="search">
        <Icon name="search" size={20} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти страну" aria-label="Найти страну" />
      </label>
      <div className="list">
        {list.map((id) => (
          <button key={id} type="button" className="list-row" onClick={() => void pick(id)}>
            <Flag id={id} />
            <span className="grow t">{countryName(id)}</span>
            {id === current ? <Icon name="check" size={18} /> : <Icon name="chevron" size={18} className="faint" />}
          </button>
        ))}
      </div>
      {current && (
        <button type="button" className="btn ghost" onClick={onDone}>
          Отмена
        </button>
      )}
    </section>
  );
}

function Tracker({ countryId, onChange }: { countryId: string; onChange: () => void }) {
  const { regions, local, failed, visited, openedRegions, total, opened, percent, bigVisited } = useHomeStats(countryId);
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const map = useMemo(() => {
    if (!regions?.length) return null;
    const W = 360;
    const H = 230;
    const fc = { type: 'FeatureCollection', features: regions } as FeatureCollection;
    const [cx, cy] = geoCentroid(fc);
    const proj = geoAzimuthalEqualArea().rotate([-cx, -cy]).fitExtent(
      [
        [8, 8],
        [W - 8, H - 8],
      ],
      fc,
    );
    const path = geoPath(proj);
    const shapes = regions.map((r) => ({ id: r.properties.id, d: path(r) ?? '' }));
    const dots = visited.filter((v) => v.lat !== null && v.lon !== null).map((v) => ({ id: v.id, p: proj([v.lon as number, v.lat as number]) }));
    const bounds = path.bounds(fc);
    const h = Math.min(H, Math.ceil(bounds[1][1] + 8));
    return { W, H: h, shapes, dots };
  }, [regions, visited]);

  const rows = useMemo(() => {
    if (!regions) return [];
    return [...regions]
      .map((r) => ({ id: r.properties.id, name: r.properties.ru, count: openedRegions.get(r.properties.id) ?? 0, all: local?.byRegion.get(r.properties.id)?.length ?? null }))
      .sort((a, b) => (b.count ? 1 : 0) - (a.count ? 1 : 0) || a.name.localeCompare(b.name, 'ru'));
  }, [regions, openedRegions, local]);
  const shown = showAll ? rows : rows.slice(0, 12);
  const region = open ? regions?.find((r) => r.properties.id === open) : undefined;

  return (
    <>
      <section className="world-hero card home-hero" aria-label="Моя страна">
        <div className="row">
          <Flag id={countryId} />
          <h2 className="h2 grow ellipsis">{countryName(countryId)}</h2>
          <button type="button" className="link-btn" onClick={onChange}>
            Изменить
          </button>
        </div>
        {regions === null ? (
          <span className="spinner" />
        ) : total === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            Для этой страны нет деления на регионы — считаем только города: {countLabel(visited.length, 'город', 'города', 'городов')}.
          </p>
        ) : (
          <>
            <div className="counter">
              <span className="big num">{opened}</span>
              <span className="of num">/{total}</span>
              <span className="unit">{plural(total, 'регион', 'региона', 'регионов')} открыто</span>
            </div>
            <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Изучено регионов">
              <i style={{ width: `${Math.max(percent, opened ? 1.5 : 0)}%` }} />
            </div>
          </>
        )}
        <div className="hero-stats">
          <div>
            <b className="num">{String(percent).replace('.', ',')}%</b>
            <span>страны</span>
          </div>
          <div>
            <b className="num">{visited.length}</b>
            <span>{plural(visited.length, 'город', 'города', 'городов')}</span>
          </div>
          <div>
            <b className="num">{bigVisited === null ? '…' : `${bigVisited}/${local?.big.length ?? 0}`}</b>
            <span>крупных</span>
          </div>
        </div>
        {map && (
          <svg className="home-map" viewBox={`0 0 ${map.W} ${map.H}`} role="img" aria-label={`Карта регионов: открыто ${opened} из ${total}`}>
            {map.shapes.map((s) => (
              <path key={s.id} d={s.d} className={openedRegions.has(s.id) ? 'on' : ''} onClick={() => setOpen(s.id)} />
            ))}
            {map.dots.map((d) => d.p && <circle key={d.id} cx={d.p[0]} cy={d.p[1]} r={2.6} />)}
          </svg>
        )}
        <p className="faint tiny" style={{ margin: 0 }}>
          Регион открыт, если вы были хотя бы в одном его городе. Крупные — города от 100 тыс. жителей.
        </p>
      </section>

      <section className="stack tight">
        <div className="section-title">
          <h3 className="h3">Города</h3>
          {adding && (
            <button type="button" className="link-btn" onClick={() => setAdding(false)}>
              Готово
            </button>
          )}
        </div>
        {adding ? (
          <PlaceSearch
            countryFilter={countryId}
            withCountries={false}
            placeholder={`Город: ${countryName(countryId)}`}
            onCity={(p) => void markCity(toast, p.kind === 'catalog' ? catalogToCity(p.city) : p.city, 'visited')}
          />
        ) : (
          <button type="button" className="btn lime block" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Отметить города
          </button>
        )}
      </section>

      {failed && <p className="muted small">Справочник городов не загрузился — проверьте интернет и откройте раздел ещё раз.</p>}

      {rows.length > 0 && (
        <>
          <div className="row between">
            <h3 className="h3">Регионы</h3>
            <span className="muted small">
              {opened} из {total}
            </span>
          </div>
          <div className="list">
            {shown.map((r) => (
              <button key={r.id} type="button" className="list-row" onClick={() => setOpen(r.id)}>
                <span className={`region-dot ${r.count ? 'on' : ''}`} aria-hidden="true" />
                <span className="grow">
                  <span className="t block ellipsis">{r.name}</span>
                  <span className="s block">{r.count ? countLabel(r.count, 'город', 'города', 'городов') : 'ещё не открыт'}</span>
                </span>
                <Icon name="chevron" size={18} className="faint" />
              </button>
            ))}
          </div>
          {rows.length > 12 && (
            <button type="button" className="btn glass-btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Свернуть' : `Показать все ${rows.length}`}
            </button>
          )}
        </>
      )}
      {rows.length === 0 && regions !== null && visited.length === 0 && (
        <Empty icon="pin" title="Пока ни одного города" text="Отметьте города кнопкой выше, на карте или в поездках — здесь появится прогресс." />
      )}

      {region && <RegionSheet region={region} cities={local?.byRegion.get(region.properties.id) ?? []} visited={visited.filter((v) => v.regionId === region.properties.id)} onClose={() => setOpen(null)} />}
    </>
  );
}

function RegionSheet({
  region,
  cities,
  visited,
  onClose,
}: {
  region: Region;
  cities: CatalogCity[];
  visited: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const { world, settings, cities: saved } = useWorld();
  const toast = useToast();
  const label = been(settings.gender);
  const [all, setAll] = useState(false);
  const rest = cities.filter((c) => !world.visitedCityIds.has(c.id));
  const todo = rest.slice(0, all ? 300 : 10);
  return (
    <Sheet title={region.properties.ru} onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        {visited.length ? `Открыт: ${countLabel(visited.length, 'город', 'города', 'городов')}` : 'Регион ещё не открыт'}
        {cities.length ? ` · в справочнике ${countLabel(cities.length, 'населённый пункт', 'населённых пункта', 'населённых пунктов')}` : ''}
      </p>
      {visited.length > 0 && (
        <div className="stack tight">
          <h3 className="h3">Где {label.short.toLowerCase()}</h3>
          <div className="list">
            {visited.map((v) => (
              <div key={v.id} className="list-row">
                <span className="region-dot on" aria-hidden="true" />
                <span className="grow t">{v.name}</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    const c = saved.get(v.id);
                    if (c) void unmarkCity(toast, c, 'visited');
                  }}
                >
                  Убрать
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {todo.length > 0 && (
        <div className="stack tight">
          <h3 className="h3">{visited.length ? 'Ещё в регионе' : 'Крупнейшие города'}</h3>
          <div className="list">
            {todo.map((c) => (
              <div key={c.id} className="list-row">
                <span className="grow">
                  <span className="t block">{c.ru}</span>
                  <span className="s block">{c.pop ? `${c.pop.toLocaleString('ru-RU')} жителей` : ''}{c.regionCapital ? ' · центр региона' : c.capital ? ' · столица' : ''}</span>
                </span>
                <button type="button" className="btn sm lime" onClick={() => void markCity(toast, catalogToCity(c), 'visited')}>
                  {label.here}
                </button>
              </div>
            ))}
          </div>
          {!all && rest.length > 10 && (
            <button type="button" className="btn glass-btn" onClick={() => setAll(true)}>
              Показать ещё {Math.min(rest.length, 300) - 10}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
