import { useMemo, useState } from 'react';
import { go, goBack } from '../../app/router';
import { useWorld } from '../../app/world';
import { countLabel, formatDate, plural } from '../../domain/dates';
import { normalize } from '../../domain/search';
import { inMethodology, METHODOLOGY_INFO, type PlaceStatus, worldProgress } from '../../domain/world';
import { COUNTRIES } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Empty, Flag, Segmented, Topo } from '../../ui/kit';
import { CountrySheet } from './CountrySheet';

type Filter = 'all' | 'visited' | 'planned' | 'none';
type Sort = 'az' | 'date';

export function Countries({ route, onSettings }: { route: string[]; onSettings: () => void }) {
  const { world, settings, trips } = useWorld();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('az');
  const openId = route[1] ?? null;

  const m = settings.methodology;
  const progress = worldProgress(COUNTRIES, world.visitedCountryIds, m);
  const status = (id: string): PlaceStatus => world.countryStatus.get(id) ?? 'none';

  // The methodology pool, plus marked territories outside it (shown but not counted).
  const pool = useMemo(
    () => COUNTRIES.filter((c) => inMethodology(c, m) || world.countryStatus.has(c.id)),
    [m, world.countryStatus],
  );
  const counts = useMemo(() => {
    const r = { all: pool.length, visited: 0, planned: 0, none: 0 };
    for (const c of pool) r[status(c.id)]++;
    return r;
  }, [pool, world.countryStatus]);

  const tripCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of trips) for (const id of t.countryIds) map.set(id, (map.get(id) ?? 0) + 1);
    return map;
  }, [trips]);

  const rows = useMemo(() => {
    const nq = normalize(q);
    let list = pool.filter((c) => (filter === 'all' || status(c.id) === filter) && (!nq || normalize(c.ru).includes(nq) || normalize(c.en).includes(nq)));
    if (sort === 'az') list = [...list].sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
    else
      list = [...list].sort((a, b) => {
        const da = world.firstVisitByCountry.get(a.id) ?? '';
        const db = world.firstVisitByCountry.get(b.id) ?? '';
        if (da && db) return db.localeCompare(da);
        if (da || db) return da ? -1 : 1;
        return a.ru.localeCompare(b.ru, 'ru');
      });
    return list;
  }, [pool, q, filter, sort, world]);

  return (
    <div className="screen countries-screen">
      <Topo />
      <div className="screen-inner">
        <header className="row between">
          <h1 className="h1">
            <span className="thin">Мой </span>мир
          </h1>
          <button type="button" className="circle-btn" onClick={onSettings} aria-label="Настройки">
            <Icon name="settings" size={20} />
          </button>
        </header>

        <section className="world-hero card" aria-label="Прогресс объезда мира">
          <div className="counter">
            <span className="big num">{progress.visited}</span>
            <span className="of num">/{progress.total}</span>
            <span className="unit">{plural(progress.total, 'страна', 'страны', 'стран')}</span>
          </div>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Исследовано мира">
            <i style={{ width: `${Math.max(progress.percent, progress.visited ? 1.5 : 0)}%` }} />
          </div>
          <div className="hero-stats">
            <div>
              <b className="num">{progress.percent}%</b>
              <span>мира</span>
            </div>
            <div>
              <b className="num">{progress.remaining}</b>
              <span>{plural(progress.remaining, 'осталась', 'осталось', 'осталось')}</span>
            </div>
            <div>
              <b className="num">{world.visitedCityIds.size}</b>
              <span>{plural(world.visitedCityIds.size, 'город', 'города', 'городов')}</span>
            </div>
          </div>
          <button type="button" className="method-note" onClick={onSettings}>
            <Icon name="info" size={16} />
            <span>
              Считаем {METHODOLOGY_INFO[m].title.toLowerCase()}. {METHODOLOGY_INFO[m].hint} Изменить
            </span>
          </button>
        </section>

        <label className="search">
          <Icon name="search" size={20} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти страну" aria-label="Найти страну" />
          {q && (
            <button type="button" className="icon-plain" onClick={() => setQ('')} aria-label="Очистить">
              <Icon name="close" size={18} />
            </button>
          )}
        </label>

        <div className="chips" role="group" aria-label="Фильтр">
          {(
            [
              ['all', 'Все'],
              ['visited', 'Посещённые'],
              ['planned', 'Запланированные'],
              ['none', 'Не посещённые'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" className="chip" aria-pressed={filter === v} onClick={() => setFilter(v)}>
              {label} <span className="count num">{counts[v]}</span>
            </button>
          ))}
        </div>

        <div className="row between">
          <span className="muted small">{countLabel(rows.length, 'страна', 'страны', 'стран')}</span>
          <Segmented
            label="Сортировка"
            value={sort}
            onChange={setSort}
            className="compact"
            options={[
              { value: 'az', label: 'А–Я' },
              { value: 'date', label: 'По дате' },
            ]}
          />
        </div>

        {rows.length === 0 ? (
          <Empty
            icon="flag"
            title={filter === 'visited' ? 'Пока нет посещённых стран' : filter === 'planned' ? 'Нет запланированных стран' : 'Ничего не найдено'}
            text={filter === 'visited' ? 'Отметьте страну в списке или на карте — счётчик обновится сам.' : undefined}
          />
        ) : (
          <div className="list country-list">
            {rows.map((c) => {
              const s = status(c.id);
              const cities = world.visitedCitiesByCountry.get(c.id) ?? 0;
              const first = world.firstVisitByCountry.get(c.id);
              const tc = tripCount.get(c.id) ?? 0;
              const sub = [
                cities ? countLabel(cities, 'город', 'города', 'городов') : null,
                first ? `с ${formatDate(first)}` : null,
                tc ? countLabel(tc, 'поездка', 'поездки', 'поездок') : null,
                !inMethodology(c, m) ? 'не входит в счёт' : null,
              ].filter(Boolean);
              return (
                <button key={c.id} type="button" className="list-row" onClick={() => go(`countries/${c.id}`)}>
                  <Flag id={c.id} />
                  <span className="grow">
                    <span className="t block ellipsis">{c.ru}</span>
                    <span className="s block ellipsis">{sub.length ? sub.join(', ') : c.continent}</span>
                  </span>
                  {s !== 'none' && <span className={`status-dot ${s}`} aria-label={s === 'visited' ? 'посещена' : 'запланирована'} />}
                  <Icon name="chevron" size={18} className="faint" />
                </button>
              );
            })}
          </div>
        )}
      </div>
      {openId && <CountrySheet countryId={openId} onClose={() => goBack('countries')} />}
    </div>
  );
}
