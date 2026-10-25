import { useState } from 'react';
import { markCity, toggleCityVisited, markCountry, tripsForCountry, unmarkCity, unmarkCountry } from '../../app/actions';
import { focusOnMap, go } from '../../app/router';
import { useToast } from '../../app/toast';
import { been, useWorld } from '../../app/world';
import { countLabel, formatDate, formatRange } from '../../domain/dates';
import { inMethodology, METHODOLOGY_INFO } from '../../domain/world';
import { catalogToCity } from '../../geo/catalog';
import { COUNTRY_BY_ID } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Confirm, Flag, Sheet } from '../../ui/kit';
import { PlaceSearch } from '../../ui/PlaceSearch';
import { StatusPill } from '../planet/PlaceCard';

/** Country details: status, its cities on the map, trips, and the actions to change them. */
export function CountrySheet({ countryId, onClose }: { countryId: string; onClose: () => void }) {
  const { world, cities, visits, trips, settings } = useWorld();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const c = COUNTRY_BY_ID.get(countryId);
  if (!c) {
    return (
      <Sheet title="Страна не найдена" onClose={onClose}>
        <p className="muted">В справочнике нет страны с кодом {countryId}.</p>
      </Sheet>
    );
  }
  const status = world.countryStatus.get(countryId) ?? 'none';
  const myCities = [...cities.values()]
    .filter((x) => x.countryId === countryId && (world.cityStatus.get(x.id) ?? 'none') !== 'none')
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const visitedCities = myCities.filter((x) => world.cityStatus.get(x.id) === 'visited').length;
  const first = world.firstVisitByCountry.get(countryId);
  const related = tripsForCountry(countryId, trips);
  const counted = inMethodology(c, settings.methodology);

  return (
    <Sheet
      title={c.ru}
      onClose={onClose}
      headExtra={<Flag id={countryId} size="lg" />}
      footer={
        <button
          type="button"
          className="btn glass-btn"
          onClick={() => {
            onClose();
            window.setTimeout(() => focusOnMap({ kind: 'country', id: countryId }), 50);
          }}
        >
          <Icon name="planet" size={18} /> Показать на карте
        </button>
      }
    >
      <div className="row wrap">
        <StatusPill status={status} feminine />
        <span className="pill">{c.continent}</span>
        {!counted && <span className="pill outline">не входит в «{METHODOLOGY_INFO[settings.methodology].title}»</span>}
      </div>
      {(visitedCities > 0 || first) && (
        <p className="muted" style={{ margin: 0 }}>
          {visitedCities > 0 ? `Посещено ${countLabel(visitedCities, 'город', 'города', 'городов')}. ` : ''}
          {first ? `Первое посещение — ${formatDate(first)}.` : ''}
        </p>
      )}
      <div className="row">
        {status !== 'visited' ? (
          <button type="button" className="btn lime grow" onClick={() => void markCountry(toast, countryId, 'visited')}>
            <Icon name="flag" size={18} /> Отметить посещённой
          </button>
        ) : (
          <button type="button" className="btn ghost grow" onClick={() => (visitedCities > 0 ? setConfirm(true) : void unmarkCountry(toast, countryId, 'visited', false))}>
            Снять отметку
          </button>
        )}
        {status === 'none' && (
          <button type="button" className="btn glass-btn grow" onClick={() => void markCountry(toast, countryId, 'planned')}>
            Запланировать
          </button>
        )}
        {status === 'planned' && (
          <button type="button" className="btn ghost" aria-label="Убрать из планов" onClick={() => void unmarkCountry(toast, countryId, 'planned', true)}>
            <Icon name="trash" size={18} />
          </button>
        )}
      </div>

      <section className="stack tight">
        <div className="section-title">
          <h3 className="h3">Города</h3>
          <button type="button" className="link-btn" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Готово' : '+ Добавить город'}
          </button>
        </div>
        {adding && (
          <PlaceSearch
            countryFilter={countryId}
            withCountries={false}
            placeholder={`Город в стране ${c.ru}`}
            onCity={(p) => {
              const city = p.kind === 'catalog' ? catalogToCity(p.city) : p.city;
              void toggleCityVisited(toast, city, world.cityStatus.get(city.id) === 'visited');
            }}
          />
        )}
        {myCities.length === 0 && !adding ? (
          <p className="faint small" style={{ margin: 0 }}>
            Города не отмечены. Отметка страны не создаёт городов сама по себе.
          </p>
        ) : (
          <div className="list">
            {myCities.map((city) => {
              const s = world.cityStatus.get(city.id) ?? 'none';
              const v = visits.find((x) => x.cityId === city.id);
              return (
                <div key={city.id} className="list-row">
                  <span className={`status-dot ${s}`} aria-hidden="true" />
                  <span className="grow">
                    <span className="t block">{city.name}</span>
                    <span className="s block">{s === 'visited' ? (v?.date ? `посещён ${formatDate(v.date)}` : 'посещён') : 'запланирован'}</span>
                  </span>
                  {s === 'planned' && (
                    <button type="button" className="btn sm lime" onClick={() => void markCity(toast, city, 'visited')}>
                      {been(settings.gender).short}
                    </button>
                  )}
                  <button type="button" className="icon-plain" aria-label={`Снять отметку: ${city.name}`} onClick={() => void unmarkCity(toast, city, 'all')}>
                    <Icon name="close" size={18} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {related.length > 0 && (
        <section className="stack tight">
          <h3 className="h3">Поездки</h3>
          <div className="list">
            {related.map((t) => (
              <button key={t.id} type="button" className="list-row" onClick={() => go(`trips/${t.id}`)}>
                <Icon name="suitcase" size={20} />
                <span className="grow">
                  <span className="t block ellipsis">{t.title}</span>
                  <span className="s block">{formatRange(t.startDate, t.endDate)}</span>
                </span>
                <Icon name="chevron" size={18} />
              </button>
            ))}
          </div>
        </section>
      )}

      {confirm && (
        <Confirm
          title="Снять отметку со страны?"
          text={`Страна считается посещённой, пока в ней отмечены города. Вместе со страной снимутся отметки с ${countLabel(visitedCities, 'города', 'городов', 'городов')}.`}
          confirmLabel="Снять вместе с городами"
          danger
          onConfirm={() => unmarkCountry(toast, countryId, 'visited', true)}
          onClose={() => setConfirm(false)}
        />
      )}
    </Sheet>
  );
}
