import { useMemo, useState } from 'react';
import { markPlaceVisited, unmarkPlaceVisited } from '../../app/hobbyActions';
import { go } from '../../app/router';
import { useToast } from '../../app/toast';
import { useWorld } from '../../app/world';
import { countLabel, plural } from '../../domain/dates';
import { groupByCountry, type HobbyKind, hobbyProgress, inRussia, type Place, placeMatches, placeTitle, RIDER_FULL, type Resort, type Spot, visitedIn } from '../../domain/hobby';
import { reloadCatalog, useCatalog } from '../../geo/hobbyCatalog';
import { countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Empty, Flag } from '../../ui/kit';
import { WatchedNotices } from './ResortWatch';

type Filter = 'all' | 'ru' | 'world' | 'mine';
const WORD: Record<HobbyKind, readonly [string, string, string]> = {
  resort: ['курорт', 'курорта', 'курортов'],
  spot: ['спот', 'спота', 'спотов'],
};

/** Visited places of one hobby, keyed by the current catalog id. */
export function useHobbyVisited(kind: HobbyKind, index: ReadonlyMap<string, Place>): Set<string> {
  const { hobby } = useWorld();
  return useMemo(() => visitedIn(index, hobby.filter((m) => m.what === 'visit' && m.kind === kind).map((m) => m.placeId)), [hobby, index, kind]);
}

export const placeHref = (kind: HobbyKind, id: string): string => `countries/@${kind}/${encodeURIComponent(id)}`;

/** «Лыжи / Борд» and «Сёрфинг» tabs of «Мой мир»: counter, Россия / Мир, search and quick «Был здесь». */
export function HobbyWorld({ kind }: { kind: HobbyKind }) {
  const { settings } = useWorld();
  const toast = useToast();
  const cat = useCatalog(kind === 'resort' ? 'resorts' : 'spots');
  const items: Place[] = cat.items as Array<Resort | Spot>;
  const visited = useHobbyVisited(kind, cat.index as Map<string, Place>);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const word = WORD[kind];

  const progress = hobbyProgress(items, visited);
  const active = useMemo(() => items.filter((p) => p.active), [items]);
  const counts = useMemo(() => {
    const ru = active.filter(inRussia);
    return { all: active.length, ru: ru.length, world: active.length - ru.length, mine: progress.visited, ruVisited: ru.filter((p) => visited.has(p.id)).length };
  }, [active, visited, progress.visited]);
  const visitedCountries = useMemo(() => new Set(active.filter((p) => visited.has(p.id)).map((p) => p.countryId)).size, [active, visited]);

  const pool = useMemo(
    () => active.filter((p) => (filter === 'ru' ? inRussia(p) : filter === 'world' ? !inRussia(p) : filter === 'mine' ? visited.has(p.id) : true)),
    [active, filter, visited],
  );
  const found = useMemo(() => (q.trim() ? active.filter((p) => placeMatches(p, q, countryName)).slice(0, 80) : []), [active, q]);
  const groups = useMemo(() => groupByCountry(pool, visited, countryName), [pool, visited]);

  const toggle = (p: Place) =>
    visited.has(p.id) ? void unmarkPlaceVisited(toast, kind, p) : void markPlaceVisited(toast, kind, p, { travelTracking: settings.travelTracking });

  const title = kind === 'resort' ? (settings.riderType ? RIDER_FULL[settings.riderType] : 'Горные лыжи') : 'Сёрфинг';

  if (!items.length) {
    if (cat.status === 'loading')
      return (
        <section className="card world-hero" aria-busy="true">
          <p className="muted" style={{ margin: 0 }}>
            Загружаю каталог {kind === 'resort' ? 'курортов' : 'сёрф-спотов'}…
          </p>
        </section>
      );
    return (
      <Empty
        icon={kind === 'resort' ? 'mountain' : 'wave'}
        title={cat.status === 'missing' ? 'Каталог ещё собирается' : 'Нет связи'}
        text={
          cat.status === 'missing'
            ? 'Каталог публикуется автоматически — загляните чуть позже.'
            : 'Каталог скачивается один раз и потом работает без интернета. Проверьте подключение.'
        }
        action={
          <button type="button" className="btn glass-btn" onClick={() => reloadCatalog(kind === 'resort' ? 'resorts' : 'spots')}>
            <Icon name="rotate" size={18} /> Повторить
          </button>
        }
      />
    );
  }

  const row = (p: Place) => {
    const on = visited.has(p.id);
    const r = p as Resort;
    const s = p as Spot;
    const sub =
      kind === 'resort'
        ? [r.region, r.pisteKm ? `${r.pisteKm} км трасс` : null, r.lifts ? countLabel(r.lifts, 'подъёмник', 'подъёмника', 'подъёмников') : null]
        : [s.area ? 'направление' : null, s.region && s.region !== s.group ? s.region : null, s.level, s.wave];
    return (
      <div key={p.id} className="list-row place-row">
        <button type="button" className="grow place-open" onClick={() => go(placeHref(kind, p.id))}>
          <span className="t block ellipsis">{placeTitle(p)}</span>
          <span className="s block ellipsis">{sub.filter(Boolean).join(' · ') || countryName(p.countryId)}</span>
        </button>
        <button type="button" className={`city-mark ${on ? 'on' : 'off'}`} aria-pressed={on} aria-label={on ? `Снять отметку: ${placeTitle(p)}` : `Был здесь: ${placeTitle(p)}`} onClick={() => toggle(p)}>
          <Icon name={on ? 'check' : 'plus'} size={16} weight={2.4} />
        </button>
      </div>
    );
  };

  return (
    <>
      <section className="world-hero card" aria-label={title}>
        <div className="counter">
          <span className="big num">{progress.visited}</span>
          <span className="of num">/{progress.total}</span>
          <span className="unit">{plural(progress.total, ...word)}</span>
        </div>
        <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Отмечено из каталога">
          <i style={{ width: `${Math.max(progress.percent, progress.visited ? 1.5 : 0)}%` }} />
        </div>
        <div className="hero-stats">
          <div>
            <b className="num">{visitedCountries}</b>
            <span>{plural(visitedCountries, 'страна', 'страны', 'стран')}</span>
          </div>
          <div>
            <b className="num">
              {counts.ruVisited}/{counts.ru}
            </b>
            <span>в России</span>
          </div>
          <div>
            <b className="num">{progress.percent}%</b>
            <span>каталога</span>
          </div>
        </div>
        {!settings.travelTracking && (
          <p className="method-note" style={{ margin: 0 }}>
            <Icon name="info" size={16} />
            <span>Учёт путешествий выключен: страны не отмечаются, {kind === 'resort' ? 'курорты' : 'споты'} — отмечаются.</span>
          </p>
        )}
      </section>

      {kind === 'resort' && <WatchedNotices />}

      <label className="search">
        <Icon name="search" size={20} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === 'resort' ? 'Курорт, страна или регион' : 'Спот, остров или страна'} aria-label="Поиск" />
        {q && (
          <button type="button" className="icon-plain" onClick={() => setQ('')} aria-label="Очистить">
            <Icon name="close" size={18} />
          </button>
        )}
      </label>

      {!q.trim() && (
        <div className="chips chips-fit" role="group" aria-label="Фильтр">
          {(
            [
              ['all', 'Все', counts.all],
              ['ru', 'Россия', counts.ru],
              ['world', 'Мир', counts.world],
              ['mine', 'Мои', counts.mine],
            ] as const
          ).map(([v, label, n]) => (
            <button key={v} type="button" className="chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>
              <span className="ellipsis">{label}</span> <span className="count num">{n}</span>
            </button>
          ))}
        </div>
      )}

      {q.trim() ? (
        found.length ? (
          <div className="list">{found.map(row)}</div>
        ) : (
          <Empty icon="search" title="Ничего не найдено" text="Ищите по названию, стране или региону." />
        )
      ) : groups.length === 0 ? (
        <Empty
          icon={kind === 'resort' ? 'mountain' : 'wave'}
          title={filter === 'mine' ? `Пока нет отмеченных ${word[2]}` : 'Пусто'}
          text={filter === 'mine' ? 'Нажмите «+» рядом с местом, где вы катались, — счётчик обновится сам.' : undefined}
        />
      ) : (
        <div className="list country-list">
          {groups.map((g) => {
            const isOpen = open.has(g.countryId) || groups.length === 1;
            return (
              <div key={g.countryId} className="place-group">
                <button
                  type="button"
                  className="list-row"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen((s) => {
                      const n = new Set(s);
                      if (n.has(g.countryId)) n.delete(g.countryId);
                      else n.add(g.countryId);
                      return n;
                    })
                  }
                >
                  <Flag id={g.countryId} />
                  <span className="grow">
                    <span className="t block ellipsis">{countryName(g.countryId)}</span>
                    <span className="s block ellipsis">
                      {g.visited ? `${g.visited} из ${g.items.length}` : countLabel(g.items.length, ...word)}
                    </span>
                  </span>
                  {g.visited > 0 && <span className="status-dot visited" aria-hidden="true" />}
                  <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={18} className="faint" />
                </button>
                {isOpen &&
                  (kind === 'spot'
                    ? g.sub.map((sg) => (
                        <div key={sg.name} className="place-sub">
                          {sg.name && <div className="place-sub-title">{sg.name}</div>}
                          {sg.items.map(row)}
                        </div>
                      ))
                    : g.items.map(row))}
              </div>
            );
          })}
        </div>
      )}
      {cat.attribution && <p className="faint tiny" style={{ margin: '4px 4px 0' }}>Данные: {cat.attribution}.</p>}
    </>
  );
}
