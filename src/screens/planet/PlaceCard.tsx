import { useState } from 'react';
import { markCity, markCountry, tripsForCity, tripsForCountry, unmarkCity, unmarkCountry } from '../../app/actions';
import { go } from '../../app/router';
import { useToast } from '../../app/toast';
import { been, store, useWorld } from '../../app/world';
import type { CityInput } from '../../data/store';
import { countLabel, formatDate, formatRange } from '../../domain/dates';
import { visitKey } from '../../domain/model';
import type { PlaceStatus } from '../../domain/world';
import { COUNTRY_BY_ID, countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Confirm, Flag } from '../../ui/kit';

export function StatusPill({ status, feminine = false }: { status: PlaceStatus; feminine?: boolean }) {
  if (status === 'none') return <span className="pill">Нет отметки</span>;
  const text = status === 'visited' ? (feminine ? 'Посещена' : 'Посещён') : feminine ? 'Запланирована' : 'Запланирован';
  return (
    <span className={`pill ${status === 'visited' ? 'lime' : 'dark'}`}>
      <Icon name={status === 'visited' ? 'check' : 'calendar'} size={14} weight={2.2} />
      {text}
    </span>
  );
}

function TripLinks({ ids }: { ids: Array<{ id: string; title: string; startDate: string | null; endDate: string | null }> }) {
  if (ids.length === 0) return null;
  return (
    <div className="stack tight">
      {ids.slice(0, 3).map((t) => (
        <button key={t.id} type="button" className="trip-link" onClick={() => go(`trips/${t.id}`)}>
          <Icon name="suitcase" size={18} />
          <span className="grow ellipsis">{t.title}</span>
          <span className="faint small">{formatRange(t.startDate, t.endDate)}</span>
          <Icon name="chevron" size={16} />
        </button>
      ))}
    </div>
  );
}

export function CityCard({ city, onClose }: { city: CityInput; onClose: () => void }) {
  const { world, visits, trips, stops, settings } = useWorld();
  const toast = useToast();
  const status = world.cityStatus.get(city.id) ?? 'none';
  const visit = visits.find((v) => v.key === visitKey(city.id, city.countryId));
  const related = tripsForCity(city.id, trips, stops);
  return (
    <article className="place-card glass" aria-label={city.name}>
      <header className="row">
        <Flag id={city.countryId} />
        <div className="grow">
          <h2 className="h2 ellipsis">{city.name}</h2>
          <div className="muted small ellipsis">
            {countryName(city.countryId)}
            {city.region && city.region !== city.name ? `, ${city.region}` : ''}
          </div>
        </div>
        <button type="button" className="circle-btn sm" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="row wrap">
        <StatusPill status={status} />
        {related.length > 1 && <span className="pill outline">{countLabel(related.length, 'поездка', 'поездки', 'поездок')}</span>}
      </div>
      {status === 'visited' && visit && (
        <label className="date-line">
          <Icon name="calendar" size={18} />
          <span className="grow">{visit.date ? `${been(settings.gender).on}: ${formatDate(visit.date)}` : 'Дата посещения не указана'}</span>
          <input
            type="date"
            className="date-mini"
            value={visit.date ?? ''}
            aria-label="Дата посещения"
            onChange={(e) => void store.setVisitDate(visit.key, e.target.value || null)}
          />
        </label>
      )}
      <TripLinks ids={related} />
      <div className="row card-actions">
        {status === 'none' && (
          <>
            <button type="button" className="btn lime grow" onClick={() => void markCity(toast, city, 'visited')}>
              <Icon name="flag" size={18} /> {been(settings.gender).here}
            </button>
            <button type="button" className="btn glass-btn grow" onClick={() => void markCity(toast, city, 'planned')}>
              Запланировать
            </button>
          </>
        )}
        {status === 'planned' && (
          <>
            <button type="button" className="btn lime grow" onClick={() => void markCity(toast, city, 'visited')}>
              <Icon name="check" size={18} /> Отметить посещённым
            </button>
            <button type="button" className="btn ghost" onClick={() => void unmarkCity(toast, city, 'planned')} aria-label="Убрать из планов">
              <Icon name="trash" size={18} />
            </button>
          </>
        )}
        {status === 'visited' && (
          <button type="button" className="btn ghost grow" onClick={() => void unmarkCity(toast, city, 'all')}>
            Снять отметку
          </button>
        )}
      </div>
    </article>
  );
}

export function CountryCard({ countryId, onClose }: { countryId: string; onClose: () => void }) {
  const { world, trips, settings } = useWorld();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const c = COUNTRY_BY_ID.get(countryId);
  const status = world.countryStatus.get(countryId) ?? 'none';
  const cities = world.visitedCitiesByCountry.get(countryId) ?? 0;
  const first = world.firstVisitByCountry.get(countryId);
  const related = tripsForCountry(countryId, trips);
  return (
    <article className="place-card glass" aria-label={c?.ru ?? countryId}>
      <header className="row">
        <Flag id={countryId} size="lg" />
        <div className="grow">
          <h2 className="h2 ellipsis">{c?.ru ?? countryId}</h2>
          <div className="muted small ellipsis">
            {c?.continent}
            {c && !c.m195 ? ', территория' : ''}
          </div>
        </div>
        <button type="button" className="circle-btn sm" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={18} />
        </button>
      </header>
      <div className="row wrap">
        <StatusPill status={status} feminine />
        {cities > 0 && <span className="pill">{countLabel(cities, 'город', 'города', 'городов')}</span>}
        {first && <span className="pill">с {formatDate(first)}</span>}
      </div>
      <TripLinks ids={related} />
      <div className="row card-actions">
        {status !== 'visited' && (
          <button type="button" className="btn lime grow" onClick={() => void markCountry(toast, countryId, 'visited')}>
            <Icon name="flag" size={18} /> {been(settings.gender).here}
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
        {status === 'visited' && (
          <button type="button" className="btn ghost grow" onClick={() => (cities > 0 ? setConfirm(true) : void unmarkCountry(toast, countryId, 'visited', false))}>
            Снять отметку
          </button>
        )}
        <button type="button" className="circle-btn" aria-label="Открыть в списке стран" onClick={() => go(`countries/${countryId}`)}>
          <Icon name="chevron" size={20} />
        </button>
      </div>
      {confirm && (
        <Confirm
          title="Снять отметку со страны?"
          text={`В стране отмечено ${countLabel(cities, 'посещённый город', 'посещённых города', 'посещённых городов')}. Страна считается посещённой, пока на карте есть её города, поэтому отметки с городов тоже будут сняты.`}
          confirmLabel="Снять вместе с городами"
          danger
          onConfirm={() => unmarkCountry(toast, countryId, 'visited', true)}
          onClose={() => setConfirm(false)}
        />
      )}
    </article>
  );
}
