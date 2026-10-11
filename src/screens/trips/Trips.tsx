import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { go } from '../../app/router';
import { db, useToday, useWorld } from '../../app/world';
import { countLabel, formatRange, type TripStatus, tripStatus } from '../../domain/dates';
import type { Trip } from '../../domain/model';
import { Icon } from '../../ui/Icon';
import { useAttachmentUrl } from '../../ui/files';
import { Empty, Flag, Topo } from '../../ui/kit';
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
    const c = tripCost(prices.get(id) ?? { transport: [], stays: [], bookings: [] }, settings.currency, settings.rates);
    return c.total > 0 ? formatMoney(c.total, c.currency, false) : null;
  };
  const counts = useMemo(() => {
    const r: Record<Filter, number> = { upcoming: 0, ongoing: 0, completed: 0 };
    for (const t of trips) r[statusOf(t)]++;
    return r;
  }, [trips, today]);
  const [filter, setFilter] = useState<Filter | null>(null);
  const active: Filter = filter ?? (counts.ongoing ? 'ongoing' : counts.upcoming || !counts.completed ? 'upcoming' : 'completed');
  const list = sortTrips(
    trips.filter((t) => statusOf(t) === active),
    statusOf,
  );

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
          <div className="chips" role="group" aria-label="Фильтр поездок">
            {(
              [
                ['upcoming', 'Предстоящие'],
                ['ongoing', 'Текущие'],
                ['completed', 'Завершённые'],
              ] as const
            ).map(([v, label]) => (
              <button key={v} type="button" className="chip" aria-pressed={active === v} onClick={() => setFilter(v)}>
                {label} <span className="count num">{counts[v]}</span>
              </button>
            ))}
          </div>
        )}
        {trips.length === 0 ? (
          <Empty
            icon="suitcase"
            title="Здесь будут ваши поездки"
            text="Соберите маршрут по городам, сохраните билеты, жильё и брони в одном месте, а потом перенесите города на карту."
          />
        ) : list.length === 0 ? (
          <Empty icon="calendar" title={active === 'ongoing' ? 'Сейчас вы не в поездке' : active === 'upcoming' ? 'Нет предстоящих поездок' : 'Нет завершённых поездок'} />
        ) : (
          <div className="trip-grid">
            {list.map((t) => (
              <TripCard
                key={t.id}
                trip={t}
                status={statusOf(t)}
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

function TripCard({ trip, status, tickets, stays, bookings, total }: { trip: Trip; status: TripStatus; tickets: number; stays: number; bookings: number; total: string | null }) {
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
          <TripStatusPill status={status} />
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
