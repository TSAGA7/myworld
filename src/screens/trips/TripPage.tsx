import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { focusOnMap, go, goBack } from '../../app/router';
import { db, store, useToday, useWorld } from '../../app/world';
import { countLabel, formatRange, nights, tripStatus } from '../../domain/dates';
import type { Trip } from '../../domain/model';
import { countryName } from '../../geo/reference';
import { useAttachmentUrl } from '../../ui/files';
import { Icon } from '../../ui/Icon';
import { Flag } from '../../ui/kit';
import { TripStatusPill, useRoute } from './common';
import { AddToMapSheet, MarkVisitedSheet } from './MapSync';
import { BudgetCard } from './Budget';
import { RouteMap } from './RouteMap';
import { DiarySection } from './Diary';
import { ExpensesSection } from './Expenses';
import { GuideSection } from './Guide';
import { HintsSection } from './Hints';
import { TripActions } from './TripActions';
import { BookingsSection, DocsSection, RouteSection, StaysSection, TasksSection, TransportSection } from './TripSections';

type Section = 'route' | 'tickets' | 'stays' | 'bookings' | 'expenses' | 'diary' | 'guide' | 'hints' | 'docs' | 'tasks';

export function TripPage({ trip }: { trip: Trip }) {
  const today = useToday();
  const { world } = useWorld();
  const route = useRoute(trip.id);
  const cover = useAttachmentUrl(trip.coverId);
  const status = tripStatus(trip.startDate, trip.endDate, today);
  const [section, setSection] = useState<Section>('route');
  const [sync, setSync] = useState<'add' | 'visited' | null>(null);
  const counts = useLiveQuery(
    async () => {
      const [t, s, b, n, f, k, e, d] = await Promise.all([
        db.transport.where('tripId').equals(trip.id).count(),
        db.stays.where('tripId').equals(trip.id).count(),
        db.bookings.where('tripId').equals(trip.id).count(),
        db.notes.where('tripId').equals(trip.id).count(),
        db.attachments.where('tripId').equals(trip.id).filter((a) => a.ownerType === 'trip').count(),
        db.tasks.where('tripId').equals(trip.id).toArray(),
        db.expenses.where('tripId').equals(trip.id).count(),
        db.diary.where('tripId').equals(trip.id).count(),
      ]);
      return { tickets: t, stays: s, bookings: b, docs: n + f, tasks: k.length, tasksDone: k.filter((x) => x.done).length, expenses: e, diary: d };
    },
    [trip.id],
    { tickets: 0, stays: 0, bookings: 0, docs: 0, tasks: 0, tasksDone: 0, expenses: 0, diary: 0 },
  );
  const points = route
    .filter((r) => r.city && r.city.lat !== null && r.city.lon !== null)
    .map((r) => ({ id: r.stop.cityId, lon: r.city?.lon as number, lat: r.city?.lat as number, visited: world.visitedCityIds.has(r.stop.cityId) }));
  const pois = useLiveQuery(
    async () =>
      [...(await db.stays.where('tripId').equals(trip.id).toArray()), ...(await db.bookings.where('tripId').equals(trip.id).toArray())]
        .filter((x) => x.lat !== null && x.lon !== null)
        .map((x) => ({ lat: x.lat as number, lon: x.lon as number })),
    [trip.id],
    [],
  );
  const n = nights(trip.startDate, trip.endDate);
  const canVisit = status !== 'upcoming';
  const places = route.length + trip.countryIds.filter((c) => !route.some((r) => r.stop.countryId === c)).length;

  const tabs: Array<[Section, string, string | null]> = [
    ['route', 'Маршрут', route.length ? String(route.length) : null],
    ['tickets', 'Билеты', counts.tickets ? String(counts.tickets) : null],
    ['stays', 'Жильё', counts.stays ? String(counts.stays) : null],
    ['bookings', 'Брони', counts.bookings ? String(counts.bookings) : null],
    ['expenses', 'Расходы', counts.expenses ? String(counts.expenses) : null],
    ['diary', 'Дневник', counts.diary ? String(counts.diary) : null],
    ['guide', 'Гид', null],
    ['hints', 'Подсказки', null],
    ['docs', 'Документы', counts.docs ? String(counts.docs) : null],
    ['tasks', 'Чек-лист', counts.tasks ? `${counts.tasksDone}/${counts.tasks}` : null],
  ];

  return (
    <div className="screen trip-screen">
      <div className="screen-inner">
        <header className="row">
          <button type="button" className="circle-btn" onClick={() => goBack('trips')} aria-label="Назад к поездкам">
            <Icon name="back" size={20} />
          </button>
          <span className="h3 grow center-title">Путешествие</span>
          <button
            type="button"
            className={`circle-btn fav-filter ${trip.favorite ? 'on' : ''}`}
            aria-pressed={!!trip.favorite}
            aria-label={trip.favorite ? 'Убрать из избранного' : 'В избранное'}
            onClick={() => void store.saveTrip({ ...trip, favorite: !trip.favorite })}
          >
            <Icon name="heart" size={20} weight={2} />
          </button>
          <button type="button" className="circle-btn" onClick={() => go(`trips/${trip.id}/edit`)} aria-label="Изменить поездку">
            <Icon name="edit" size={20} />
          </button>
        </header>

        <div className="trip-hero">
          {cover ? <img className="cover" src={cover} alt="" /> : <RouteMap points={points} width={680} height={300} pois={pois} />}
          <div className="trip-visual-top">
            <TripStatusPill status={status} />
            {points.length > 0 && (
              <button type="button" className="pill dark" onClick={() => focusOnMap({ kind: 'trip', id: trip.id })}>
                <Icon name="planet" size={14} /> На карте
              </button>
            )}
          </div>
        </div>

        <div className="stack tight">
          <h1 className="h1 trip-title">{trip.title}</h1>
          <div className="row wrap muted">
            <span className="date-pill num">{formatRange(trip.startDate, trip.endDate)}</span>
            {n !== null && <span className="small">{countLabel(n, 'ночь', 'ночи', 'ночей')}</span>}
            <span className="small">{countLabel(route.length, 'город', 'города', 'городов')}</span>
          </div>
          {trip.countryIds.length > 0 && (
            <div className="row wrap">
              {trip.countryIds.map((c) => (
                <button key={c} type="button" className="pill country-pill" onClick={() => go(`countries/${c}`)}>
                  <Flag id={c} size="sm" /> {countryName(c)}
                </button>
              ))}
            </div>
          )}
          {trip.note && <p className="trip-note">{trip.note}</p>}
        </div>

        <section className="card map-sync" aria-label="Перенос на общую карту">
          <button type="button" className="btn lime block" disabled={places === 0} onClick={() => setSync('add')}>
            <Icon name="pin" size={18} /> Добавить города на карту
          </button>
          <button type="button" className="btn dark block" disabled={!canVisit || places === 0} onClick={() => setSync('visited')}>
            <Icon name="check" size={18} /> Отметить города посещёнными
          </button>
          <p className="faint small" style={{ margin: 0 }}>
            {places === 0
              ? 'Добавьте в маршрут города или страны — их можно будет перенести на карту.'
              : canVisit
                ? 'Города попадут на карту как запланированные. Посещёнными они станут только после вашего подтверждения.'
                : 'Отметить посещёнными можно, когда поездка начнётся. До этого города добавляются на карту как запланированные.'}
          </p>
        </section>

        <TripActions trip={trip} route={route} />

        <BudgetCard tripId={trip.id} onAdd={() => setSection('expenses')} />

        <div className="chips section-tabs" role="tablist" aria-label="Разделы поездки">
          {tabs.map(([id, label, badge]) => (
            <button key={id} type="button" role="tab" className="chip" aria-selected={section === id} aria-pressed={section === id} onClick={() => setSection(id)}>
              {label}
              {badge && <span className="count num">{badge}</span>}
            </button>
          ))}
        </div>

        {section === 'route' && <RouteSection trip={trip} route={route} />}
        {section === 'tickets' && <TransportSection trip={trip} />}
        {section === 'stays' && <StaysSection trip={trip} />}
        {section === 'bookings' && <BookingsSection trip={trip} />}
        {section === 'expenses' && <ExpensesSection trip={trip} />}
        {section === 'diary' && <DiarySection trip={trip} route={route} />}
        {section === 'guide' && <GuideSection trip={trip} route={route} />}
        {section === 'hints' && <HintsSection trip={trip} route={route} />}
        {section === 'docs' && <DocsSection trip={trip} />}
        {section === 'tasks' && <TasksSection trip={trip} />}
      </div>

      {sync === 'add' && <AddToMapSheet trip={trip} onClose={() => setSync(null)} />}
      {sync === 'visited' && <MarkVisitedSheet trip={trip} onClose={() => setSync(null)} />}
    </div>
  );
}
