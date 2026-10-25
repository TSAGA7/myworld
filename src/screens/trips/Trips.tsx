import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { go } from '../../app/router';
import { db, setSetting, useToday, useWorld } from '../../app/world';
import { TripCarousel } from './TripCarousel';
import { countLabel, formatRange, tripStatus } from '../../domain/dates';
import type { Trip } from '../../domain/model';
import { Icon } from '../../ui/Icon';
import { useAttachmentUrl } from '../../ui/files';
import { Empty, Flag, Segmented, Topo } from '../../ui/kit';
import { sortTrips, TripStatusPill, useRoute } from './common';
import { useAllTripPrices } from './Budget';
import { RouteMap } from './RouteMap';
import { formatMoney, tripCost } from '../../domain/money';
import { TripEditor } from './TripEditor';
import { TripPage } from './TripPage';

export function Trips({ route }: { route: string[] }) {
  const { trips } = useWorld();
  const id = route[1];
  if (id === 'new') return <TripEditor tripId={null} />;
  if (id) {
    const trip = trips.find((t) => t.id === id);
    if (!trip) {
      return (
        <div className="screen">
          <div className="screen-inner">
            <Empty icon="suitcase" title="Поездка не найдена" text="Возможно, её удалили." action={<button type="button" className="btn dark" onClick={() => go('trips')}>К списку поездок</button>} />
          </div>
        </div>
      );
    }
    return route[2] === 'edit' ? <TripEditor tripId={trip.id} /> : <TripPage trip={trip} />;
  }
  return <TripList />;
}

type Filter = 'upcoming' | 'ongoing' | 'completed';

function TripList() {
  const { trips, transport, stays, bookings } = useTripRecords();
  const today = useToday();
  const statusOf = (t: Trip) => tripStatus(t.startDate, t.endDate, today);
  const prices = useAllTripPrices();
  const { settings } = useWorld();
  const totalOf = (id: string): string | null => {
    const c = tripCost(prices.get(id) ?? { transport: [], stays: [], bookings: [], expenses: [] }, settings.currency, settings.rates);
    return c.total > 0 ? formatMoney(c.total, c.currency, false) : null;
  };
  const counts = useMemo(() => {
    const r: Record<Filter, number> = { upcoming: 0, ongoing: 0, completed: 0 };
    for (const t of trips) r[statusOf(t)]++;
    return r;
  }, [trips, today]);
  const [filter, setFilter] = useState<Filter | null>(null);
  const active: Filter = filter ?? (counts.ongoing ? 'ongoing' : counts.upcoming || !counts.completed ? 'upcoming' : 'completed');
  const [favOnly, setFavOnly] = useState(false);
  // Liked trips go first; the heart filter shows liked trips of any status.
  const list = sortTrips(
    trips.filter((t) => (favOnly ? t.favorite : statusOf(t) === active)),
    statusOf,
  ).sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite));

  return (
    <div className="screen trips-screen">
      <Topo />
      <div className="screen-inner">
        <header className="trips-head">
          <h1 className="display">
            <span className="thin">Планируйте,</span>
            <span className="thin">бронируйте</span>
            путешествуйте
          </h1>
        </header>
        <button type="button" className="btn lime block new-trip" onClick={() => go('trips/new')}>
          <Icon name="plus" size={20} /> Новое путешествие
        </button>
        {trips.length > 0 && (
          <div className="trips-filter">
            <Segmented
              label="Какие поездки показать"
              className="grow trip-tabs"
              value={active}
              onChange={(v) => {
                setFilter(v);
                setFavOnly(false);
              }}
              options={[
                { value: 'upcoming', label: 'Впереди', badge: counts.upcoming },
                { value: 'ongoing', label: 'Сейчас', badge: counts.ongoing },
                { value: 'completed', label: 'Прошлые', badge: counts.completed },
              ]}
            />
            <button
              type="button"
              className={`circle-btn fav-filter ${favOnly ? 'on' : ''}`}
              aria-pressed={favOnly}
              aria-label="Только избранные"
              onClick={() => setFavOnly((f) => !f)}
            >
              <Icon name="heart" size={20} weight={2} />
            </button>
            <button
              type="button"
              className="circle-btn"
              aria-label={settings.tripsView === 'carousel' ? 'Показать списком' : 'Показать карточками'}
              onClick={() => void setSetting('tripsView', settings.tripsView === 'carousel' ? 'list' : 'carousel')}
            >
              <Icon name={settings.tripsView === 'carousel' ? 'list' : 'grid'} size={19} />
            </button>
          </div>
        )}
        {trips.length === 0 ? (
          <Empty
            icon="suitcase"
            title="Здесь будут ваши поездки"
            text="Соберите маршрут по городам, сохраните билеты, жильё и брони в одном месте, а потом перенесите города на карту."
          />
        ) : list.length === 0 ? (
          <Empty
            icon={favOnly ? 'heart' : 'calendar'}
            title={favOnly ? 'Нет избранных поездок' : active === 'ongoing' ? 'Сейчас вы не в поездке' : active === 'upcoming' ? 'Нет предстоящих поездок' : 'Нет прошлых поездок'}
            text={favOnly ? 'Нажмите ♥ на карточке поездки — любимые поездки будут первыми в списке и появятся в профиле.' : undefined}
          />
        ) : settings.tripsView === 'carousel' ? (
          <TripCarousel trips={list} totalOf={totalOf} />
        ) : (
          <div className="trip-grid">
            {list.map((t) => (
              <TripCard
                key={t.id}
                trip={t}
                tickets={transport.get(t.id) ?? 0}
                stays={stays.get(t.id) ?? 0}
                bookings={bookings.get(t.id) ?? 0}
                total={totalOf(t.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_COUNTS = { transport: new Map<string, number>(), stays: new Map<string, number>(), bookings: new Map<string, number>() };

/** Counts of tickets, stays and bookings per trip, for the card indicators. */
function useTripRecords() {
  const { trips } = useWorld();
  const counts = useLiveQuery(async () => {
    const [a, b, c] = await Promise.all([db.transport.toArray(), db.stays.toArray(), db.bookings.toArray()]);
    const by = (list: Array<{ tripId: string }>) => {
      const m = new Map<string, number>();
      for (const r of list) m.set(r.tripId, (m.get(r.tripId) ?? 0) + 1);
      return m;
    };
    return { transport: by(a), stays: by(b), bookings: by(c) };
  }, []);
  return { trips, ...(counts ?? EMPTY_COUNTS) };
}

function TripCard({ trip, tickets, stays, bookings, total }: { trip: Trip; tickets: number; stays: number; bookings: number; total: string | null }) {
  const route = useRoute(trip.id);
  const { world } = useWorld();
  const cover = useAttachmentUrl(trip.coverId);
  const points = route
    .filter((r) => r.city && r.city.lat !== null && r.city.lon !== null)
    .map((r) => ({ id: r.stop.cityId, lon: r.city?.lon as number, lat: r.city?.lat as number, visited: world.visitedCityIds.has(r.stop.cityId) }));
  const cityNames = route.map((r) => r.city?.name ?? '?');
  return (
    <button type="button" className="trip-card" onClick={() => go(`trips/${trip.id}`)}>
      <div className="trip-visual">
        {cover ? <img src={cover} alt="" className="cover" /> : <RouteMap points={points} width={420} height={170} numbered={false} />}
        <div className="trip-visual-top">
          <span className="row" style={{ gap: 6 }}>
            <TripStatusPill trip={trip} />
            {trip.favorite && (
              <span className="heart mini on" aria-label="В избранном">
                <Icon name="heart" size={15} weight={2} />
              </span>
            )}
          </span>
          <span className="trip-flags">
            {trip.countryIds.slice(0, 4).map((c) => (
              <Flag key={c} id={c} size="sm" />
            ))}
            {trip.countryIds.length > 4 && <span className="pill">+{trip.countryIds.length - 4}</span>}
          </span>
        </div>
      </div>
      <div className="trip-body">
        <div className="row between">
          <h3 className="h3 ellipsis">{trip.title}</h3>
          <span className="date-pill num">{formatRange(trip.startDate, trip.endDate)}</span>
        </div>
        {cityNames.length > 0 ? (
          <div className="trip-route">
            <span className="ellipsis">{cityNames.join(' → ')}</span>
          </div>
        ) : (
          <div className="faint small">Маршрут ещё не составлен</div>
        )}
        <div className="row trip-meta">
          <span>{countLabel(route.length, 'город', 'города', 'городов')}</span>
          {total && <b className="trip-total num">{total}</b>}
          <span className="grow" />
          <Indicator icon="ticket" n={tickets} label="билетов" />
          <Indicator icon="bed" n={stays} label="жильё" />
          <Indicator icon="calendar" n={bookings} label="броней" />
        </div>
      </div>
    </button>
  );
}

function Indicator({ icon, n, label }: { icon: 'ticket' | 'bed' | 'calendar'; n: number; label: string }) {
  return (
    <span className={`indicator ${n ? 'on' : ''}`} title={`${label}: ${n}`} aria-label={`${label}: ${n}`}>
      <Icon name={icon} size={16} />
      {n > 0 && <b className="num">{n}</b>}
    </span>
  );
}
