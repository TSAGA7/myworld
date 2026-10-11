import { useLiveQuery } from 'dexie-react-hooks';
import { type ReactNode, useState } from 'react';
import { focusOnMap, go } from '../../app/router';
import { useToast } from '../../app/toast';
import { db, store, useWorld } from '../../app/world';
import type { Stamped } from '../../data/store';
import { countLabel, formatDate, formatRange, nights } from '../../domain/dates';
import {
  BOOKING_KINDS,
  type GeneralBooking,
  NOTE_KINDS,
  type AccommodationBooking,
  STAY_KINDS,
  TRANSPORT_MODES,
  type TransportBooking,
  type Trip,
  type TripNote,
} from '../../domain/model';
import { countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { locateAddress } from '../../geo/locate';
import { Check, Confirm, Empty, Field, Flag, Segmented, Sheet } from '../../ui/kit';
import { CURRENCIES, CURRENCY_SIGN, type Currency, formatMoney, isCurrency } from '../../domain/money';
import { AttachmentField, AttachmentRow, AttachmentTile, savePending } from './Attachments';
import {
  BOOKING_LABEL,
  MODE_ICON,
  MODE_LABEL,
  NOTE_ICON,
  NOTE_LABEL,
  parsePrice,
  type RouteStop,
  safeUrl,
  STAY_LABEL,
} from './common';

// ====================================================================== Route

export function RouteSection({ trip, route }: { trip: Trip; route: RouteStop[] }) {
  const { world } = useWorld();
  if (route.length === 0) {
    return (
      <Empty
        icon="route"
        title="Маршрут пуст"
        text="Добавьте города в порядке посещения и даты остановок."
        action={
          <button type="button" className="btn dark" onClick={() => go(`trips/${trip.id}/edit`)}>
            Составить маршрут
          </button>
        }
      />
    );
  }
  return (
    <ol className="route-list">
      {route.map(({ stop, city }, i) => {
        const status = world.cityStatus.get(stop.cityId) ?? 'none';
        const n = nights(stop.startDate, stop.endDate);
        const hasCoords = !!city && city.lat !== null;
        return (
          <li key={stop.id} className="route-stop">
            <span className={`stop-num num ${status}`}>{i + 1}</span>
            <div className="card tight grow">
              <div className="row">
                <div className="grow">
                  <div className="strong ellipsis">{city?.name ?? 'Город удалён'}</div>
                  <div className="faint small row">
                    <Flag id={stop.countryId} size="sm" />
                    {countryName(stop.countryId)}
                  </div>
                </div>
                {hasCoords ? (
                  <button type="button" className="circle-btn sm" aria-label={`Показать ${city?.name} на карте`} onClick={() => focusOnMap({ kind: 'city', id: stop.cityId })}>
                    <Icon name="planet" size={18} />
                  </button>
                ) : (
                  <button type="button" className="btn sm ghost" onClick={() => focusOnMap({ kind: 'relocate', id: stop.cityId })}>
                    <Icon name="pin" size={16} /> Указать на карте
                  </button>
                )}
              </div>
              <div className="row wrap small muted stop-meta">
                {stop.startDate || stop.endDate ? <span>{formatRange(stop.startDate, stop.endDate)}</span> : <span className="faint">даты не указаны</span>}
                {n !== null && n > 0 && <span>{countLabel(n, 'ночь', 'ночи', 'ночей')}</span>}
                {status === 'visited' && <span className="pill lime">посещён</span>}
                {status === 'planned' && <span className="pill dark">на карте</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ====================================================================== shared bits

function SectionHead({ title, onAdd, addLabel }: { title: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="section-title">
      <h3 className="h2">{title}</h3>
      <button type="button" className="btn sm lime" onClick={onAdd}>
        <Icon name="plus" size={16} /> {addLabel}
      </button>
    </div>
  );
}

const text = (v: string) => v;

function FormSheet({
  title,
  onClose,
  onSave,
  onDelete,
  canSave,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  onDelete?: () => Promise<void>;
  canSave: boolean;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const toast = useToast();
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className="btn danger" aria-label="Удалить запись" onClick={() => setDel(true)}>
              <Icon name="trash" size={18} />
            </button>
          )}
          <button
            type="button"
            className="btn dark"
            disabled={!canSave || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave();
                onClose();
              } catch (e) {
                toast(`Не удалось сохранить: ${e instanceof Error ? e.message : e}`);
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить
          </button>
        </>
      }
    >
      {children}
      {del && onDelete && (
        <Confirm
          title="Удалить запись?"
          text="Запись и прикреплённые к ней файлы удалятся."
          confirmLabel="Удалить"
          danger
          onConfirm={async () => {
            await onDelete();
            onClose();
          }}
          onClose={() => setDel(false)}
        />
      )}
    </Sheet>
  );
}

function PriceFields({ price, currency, setPrice, setCurrency }: { price: string; currency: string; setPrice: (v: string) => void; setCurrency: (v: string) => void }) {
  const legacy = currency && !isCurrency(currency.toUpperCase()) ? currency.toUpperCase() : null;
  return (
    <div className="stack tight">
      <div className="field">
        <span>Стоимость</span>
        <div className="price-input">
          <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" aria-label="Стоимость" />
          <Segmented
            label="Валюта"
            className="currency-switch"
            value={(isCurrency(currency.toUpperCase()) ? currency.toUpperCase() : '') as Currency}
            onChange={setCurrency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_SIGN[c] }))}
          />
        </div>
      </div>
      {legacy && <span className="faint tiny">Валюта {legacy} не входит в сумму поездки — выберите ₽, $ или €.</span>}
    </div>
  );
}

function LinkOut({ url, label }: { url: string; label: string }) {
  const safe = safeUrl(url);
  if (!safe) return null;
  return (
    <a className="pill link-pill" href={safe} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      <Icon name="external" size={14} /> {label}
    </a>
  );
}

const useToastFn = () => useToast();

// ====================================================================== Tickets

const emptyTransport = (tripId: string, currency: Currency): Stamped<TransportBooking> => ({
  tripId, mode: 'flight', carrier: '', number: '', from: '', to: '', departDate: null, departTime: null, arriveDate: null, arriveTime: null,
  confirmation: '', price: null, currency, url: '', note: '',
});

export function TransportSection({ trip }: { trip: Trip }) {
  const { settings } = useWorld();
  const list = useLiveQuery(() => db.transport.where('tripId').equals(trip.id).toArray(), [trip.id], []);
  const [edit, setEdit] = useState<Stamped<TransportBooking> | null>(null);
  const sorted = [...list].sort((a, b) => `${a.departDate ?? '9'}${a.departTime ?? ''}`.localeCompare(`${b.departDate ?? '9'}${b.departTime ?? ''}`));
  return (
    <section className="stack">
      <SectionHead title="Билеты" addLabel="Билет" onAdd={() => setEdit(emptyTransport(trip.id, settings.currency))} />
      {sorted.length === 0 ? (
        <Empty icon="ticket" title="Билетов пока нет" text="Самолёты, поезда, автобусы, паромы и аренда авто. Достаточно указать вид транспорта — остальное по желанию." />
      ) : (
        sorted.map((t) => <TicketCard key={t.id} t={t} onEdit={() => setEdit(t)} />)
      )}
      {edit && <TransportForm value={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function initials(s: string) {
  const w = s.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase() || '—';
}

/** Ticket card in the reference style: carrier, A ---✈--- B, times, dark price pill. */
function TicketCard({ t, onEdit }: { t: TransportBooking; onEdit: () => void }) {
  const price = t.price === null ? null : formatMoney(t.price, t.currency || 'RUB');
  return (
    <article className="ticket card">
      <header className="row">
        <span className="carrier-logo" aria-hidden="true">
          {t.carrier ? initials(t.carrier) : <Icon name={MODE_ICON[t.mode]} size={20} />}
        </span>
        <div className="grow">
          <div className="strong ellipsis">{t.carrier || MODE_LABEL[t.mode]}</div>
          <div className="faint small">
            {MODE_LABEL[t.mode]}
            {t.number ? `, ${t.number}` : ''}
          </div>
        </div>
        <button type="button" className="circle-btn sm" onClick={onEdit} aria-label="Изменить билет">
          <Icon name="edit" size={16} />
        </button>
      </header>
      {(t.from || t.to) && (
        <div className="leg">
          <span className="leg-end">
            <b>{t.from || '—'}</b>
          </span>
          <span className="leg-line" aria-hidden="true">
            <i />
            <Icon name={MODE_ICON[t.mode]} size={20} />
            <i />
          </span>
          <span className="leg-end right">
            <b>{t.to || '—'}</b>
          </span>
        </div>
      )}
      {(t.departDate || t.departTime || t.arriveDate || t.arriveTime) && (
        <div className="times">
          <div>
            <b className="num">{t.departTime ?? '—'}</b>
            <span className="faint small">{formatDate(t.departDate)}</span>
          </div>
          <div className="right">
            <b className="num">{t.arriveTime ?? '—'}</b>
            <span className="faint small">{formatDate(t.arriveDate)}</span>
          </div>
        </div>
      )}
      <footer className="row wrap ticket-foot">
        {t.confirmation && <span className="pill">Бронь {t.confirmation}</span>}
        <LinkOut url={t.url} label="Билет" />
        <span className="grow" />
        {price && <span className="pill dark price">{price}</span>}
      </footer>
      {t.note && <p className="small muted note-text">{t.note}</p>}
      <AttachmentRow ownerId={t.id} />
    </article>
  );
}

export function TransportForm({ value, onClose, initialFiles = [] }: { value: Stamped<TransportBooking>; onClose: () => void; initialFiles?: File[] }) {
  const { settings } = useWorld();
  const toast = useToastFn();
  const [v, setV] = useState(value);
  const [price, setPrice] = useState(value.price === null ? '' : String(value.price));
  const [files, setFiles] = useState<File[]>(initialFiles);
  const set = <K extends keyof TransportBooking>(k: K, x: TransportBooking[K]) => setV((s) => ({ ...s, [k]: x }));
  return (
    <FormSheet
      title={value.id ? 'Билет' : 'Новый билет'}
      onClose={onClose}
      canSave
      onSave={async () => {
        const saved = await store.saveTransport({ ...v, price: parsePrice(price), currency: v.currency.trim() || settings.currency });
        await savePending(saved.tripId, 'transport', saved.id, files, toast);
      }}
      onDelete={value.id ? () => store.deleteRecord('transport', value.id as string) : undefined}
    >
      <div className="mode-grid" role="group" aria-label="Вид транспорта">
        {TRANSPORT_MODES.map((m) => (
          <button key={m} type="button" className="mode" aria-pressed={v.mode === m} onClick={() => set('mode', m)}>
            <Icon name={MODE_ICON[m]} size={20} />
            <span>{MODE_LABEL[m]}</span>
          </button>
        ))}
      </div>
      <div className="grid-2">
        <Field label="Перевозчик">
          <input className="input" value={v.carrier} onChange={(e) => set('carrier', text(e.target.value))} placeholder={v.mode === 'car' ? 'Sixt' : 'Аэрофлот'} />
        </Field>
        <Field label={v.mode === 'flight' ? 'Номер рейса' : v.mode === 'train' ? 'Номер поезда' : 'Номер'}>
          <input className="input" value={v.number} onChange={(e) => set('number', e.target.value)} placeholder={v.mode === 'flight' ? 'SU 2402' : ''} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label={v.mode === 'car' ? 'Где получить' : 'Откуда'}>
          <input className="input" value={v.from} onChange={(e) => set('from', e.target.value)} placeholder="Москва, SVO" />
        </Field>
        <Field label={v.mode === 'car' ? 'Где сдать' : 'Куда'}>
          <input className="input" value={v.to} onChange={(e) => set('to', e.target.value)} placeholder="Рим, FCO" />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Отправление">
          <input className="input" type="date" value={v.departDate ?? ''} onChange={(e) => set('departDate', e.target.value || null)} />
        </Field>
        <Field label="Время">
          <input className="input" type="time" value={v.departTime ?? ''} onChange={(e) => set('departTime', e.target.value || null)} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Прибытие">
          <input className="input" type="date" value={v.arriveDate ?? ''} min={v.departDate ?? undefined} onChange={(e) => set('arriveDate', e.target.value || null)} />
        </Field>
        <Field label="Время">
          <input className="input" type="time" value={v.arriveTime ?? ''} onChange={(e) => set('arriveTime', e.target.value || null)} />
        </Field>
      </div>
      <p className="faint tiny" style={{ margin: '-6px 4px 0' }}>Время — местное, как в билете. Приложение не пересчитывает часовые пояса.</p>
      <Field label="Номер бронирования">
        <input className="input" value={v.confirmation} onChange={(e) => set('confirmation', e.target.value)} autoCapitalize="characters" />
      </Field>
      <PriceFields price={price} currency={v.currency} setPrice={setPrice} setCurrency={(c) => set('currency', c)} />
      <Field label="Ссылка на билет">
        <input className="input" type="url" inputMode="url" value={v.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Заметки">
        <textarea className="textarea" value={v.note} onChange={(e) => set('note', e.target.value)} />
      </Field>
      <AttachmentField tripId={v.tripId} ownerType="transport" ownerId={value.id ?? null} pending={files} setPending={setFiles} label="Билет: файл или фото" />
    </FormSheet>
  );
}

// ====================================================================== Stays

const emptyStay = (tripId: string, currency: Currency): Stamped<AccommodationBooking> => ({
  tripId, kind: 'hotel', name: '', address: '', cityId: null, lat: null, lon: null, checkIn: null, checkOut: null, confirmation: '',
  price: null, currency, url: '', contact: '', note: '',
});

export function StaysSection({ trip }: { trip: Trip }) {
  const list = useLiveQuery(() => db.stays.where('tripId').equals(trip.id).toArray(), [trip.id], []);
  const [edit, setEdit] = useState<Stamped<AccommodationBooking> | null>(null);
  const { cities, settings } = useWorld();
  const sorted = [...list].sort((a, b) => (a.checkIn ?? '9').localeCompare(b.checkIn ?? '9'));
  return (
    <section className="stack">
      <SectionHead title="Жильё" addLabel="Жильё" onAdd={() => setEdit(emptyStay(trip.id, settings.currency))} />
      {sorted.length === 0 ? (
        <Empty icon="bed" title="Жильё не добавлено" text="Отели, апартаменты, хостелы. Привяжите жильё к городу маршрута — оно появится в нужном месте." />
      ) : (
        sorted.map((s) => {
          const price = s.price === null ? null : formatMoney(s.price, s.currency || 'RUB');
          const n = nights(s.checkIn, s.checkOut);
          const city = s.cityId ? cities.get(s.cityId) : undefined;
          return (
            <article key={s.id} className="card stay-card">
              <header className="row">
                <span className="carrier-logo" aria-hidden="true">
                  <Icon name="bed" size={20} />
                </span>
                <div className="grow">
                  <div className="strong ellipsis">{s.name}</div>
                  <div className="faint small ellipsis">
                    {STAY_LABEL[s.kind]}
                    {city ? `, ${city.name}` : ''}
                  </div>
                </div>
                <button type="button" className="circle-btn sm" onClick={() => setEdit(s)} aria-label="Изменить жильё">
                  <Icon name="edit" size={16} />
                </button>
              </header>
              <div className="times">
                <div>
                  <span className="faint tiny">Заезд</span>
                  <b>{formatDate(s.checkIn, false) || '—'}</b>
                </div>
                <div className="right">
                  <span className="faint tiny">Выезд</span>
                  <b>{formatDate(s.checkOut, false) || '—'}</b>
                </div>
              </div>
              {s.address && (
                <div className="row small muted">
                  <Icon name="pin" size={16} />
                  <span className="grow">{s.address}</span>
                  {city && city.lat !== null && (
                    <button type="button" className="link-btn" onClick={() => focusOnMap({ kind: 'city', id: city.id })}>
                      На карте
                    </button>
                  )}
                </div>
              )}
              <footer className="row wrap ticket-foot">
                {n !== null && <span className="pill">{countLabel(n, 'ночь', 'ночи', 'ночей')}</span>}
                {s.confirmation && <span className="pill">Бронь {s.confirmation}</span>}
                <LinkOut url={s.url} label="Бронирование" />
                <span className="grow" />
                {price && <span className="pill dark price">{price}</span>}
              </footer>
              {s.contact && <p className="small muted note-text">Контакты: {s.contact}</p>}
              {s.note && <p className="small muted note-text">{s.note}</p>}
              <AttachmentRow ownerId={s.id} />
            </article>
          );
        })
      )}
      {edit && <StayForm value={edit} onClose={() => setEdit(null)} trip={trip} />}
    </section>
  );
}

export function StayForm({ value, onClose, trip, initialFiles = [] }: { value: Stamped<AccommodationBooking>; onClose: () => void; trip: Trip; initialFiles?: File[] }) {
  const toast = useToastFn();
  const { stops, cities } = useWorld();
  const routeCities = stops
    .filter((s) => s.tripId === trip.id)
    .sort((a, b) => a.order - b.order)
    .map((s) => cities.get(s.cityId))
    .filter((c, i, arr): c is NonNullable<typeof c> => !!c && arr.findIndex((x) => x?.id === c.id) === i);
  const [v, setV] = useState(value);
  const [price, setPrice] = useState(value.price === null ? '' : String(value.price));
  const [files, setFiles] = useState<File[]>(initialFiles);
  const set = <K extends keyof AccommodationBooking>(k: K, x: AccommodationBooking[K]) => setV((s) => ({ ...s, [k]: x }));
  return (
    <FormSheet
      title={value.id ? 'Жильё' : 'Новое жильё'}
      onClose={onClose}
      canSave={v.name.trim().length > 0}
      onSave={async () => {
        const city = v.cityId ? cities.get(v.cityId) : undefined;
        const addressChanged = v.address.trim() !== value.address.trim();
        // Coordinates: the address once found on the map; until then nothing (the city pin already marks the city).
        const keep = !addressChanged && value.lat !== null ? { lat: value.lat, lon: value.lon } : { lat: null, lon: null };
        const saved = await store.saveStay({ ...v, name: v.name.trim(), price: parsePrice(price), ...keep });
        await savePending(saved.tripId, 'stay', saved.id, files, toast);
        if (saved.address && (addressChanged || saved.lat === null)) {
          void locateAddress('stays', saved.id, saved.address, city?.name ?? '').then((r) =>
            toast(r === 'found' ? `${saved.name}: адрес найден, флажок на карте` : r === 'offline' ? 'Адрес найдём на карте, когда появится интернет' : `${saved.name}: адрес не найден — проверьте написание`),
          );
        }
      }}
      onDelete={value.id ? () => store.deleteRecord('stays', value.id as string) : undefined}
    >
      <div className="chips" role="group" aria-label="Тип жилья">
        {STAY_KINDS.map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={v.kind === k} onClick={() => set('kind', k)}>
            {STAY_LABEL[k]}
          </button>
        ))}
      </div>
      <Field label="Название">
        <input className="input" value={v.name} onChange={(e) => set('name', e.target.value)} placeholder="Hotel Artemide" />
      </Field>
      {routeCities.length > 0 && (
        <Field label="Город маршрута" hint="По нему жильё показывается на карте">
          <select className="select" value={v.cityId ?? ''} onChange={(e) => set('cityId', e.target.value || null)}>
            <option value="">Не выбран</option>
            {routeCities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Адрес" hint={value.lat !== null && v.address === value.address ? 'Отмечено на карте флажком' : 'После сохранения адрес сам найдётся на карте'}>
        <input className="input" value={v.address} onChange={(e) => set('address', e.target.value)} />
      </Field>
      <div className="grid-2">
        <Field label="Заезд">
          <input className="input" type="date" value={v.checkIn ?? ''} onChange={(e) => set('checkIn', e.target.value || null)} />
        </Field>
        <Field label="Выезд">
          <input className="input" type="date" value={v.checkOut ?? ''} min={v.checkIn ?? undefined} onChange={(e) => set('checkOut', e.target.value || null)} />
        </Field>
      </div>
      <Field label="Номер бронирования">
        <input className="input" value={v.confirmation} onChange={(e) => set('confirmation', e.target.value)} />
      </Field>
      <PriceFields price={price} currency={v.currency} setPrice={setPrice} setCurrency={(c) => set('currency', c)} />
      <Field label="Ссылка на бронирование">
        <input className="input" type="url" inputMode="url" value={v.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Контакты">
        <input className="input" value={v.contact} onChange={(e) => set('contact', e.target.value)} placeholder="Телефон, почта, хозяин" />
      </Field>
      <Field label="Заметки">
        <textarea className="textarea" value={v.note} onChange={(e) => set('note', e.target.value)} />
      </Field>
      <AttachmentField tripId={v.tripId} ownerType="stay" ownerId={value.id ?? null} pending={files} setPending={setFiles} label="Подтверждение: файл или фото" />
    </FormSheet>
  );
}

// ====================================================================== Other bookings

const emptyBooking = (tripId: string, currency: Currency): Stamped<GeneralBooking> => ({
  tripId, kind: 'tour', title: '', date: null, time: null, place: '', lat: null, lon: null, confirmation: '', price: null, currency, url: '', note: '',
});

export function BookingsSection({ trip }: { trip: Trip }) {
  const { settings } = useWorld();
  const list = useLiveQuery(() => db.bookings.where('tripId').equals(trip.id).toArray(), [trip.id], []);
  const [edit, setEdit] = useState<Stamped<GeneralBooking> | null>(null);
  const sorted = [...list].sort((a, b) => `${a.date ?? '9'}${a.time ?? ''}`.localeCompare(`${b.date ?? '9'}${b.time ?? ''}`));
  return (
    <section className="stack">
      <SectionHead title="Брони" addLabel="Бронь" onAdd={() => setEdit(emptyBooking(trip.id, settings.currency))} />
      {sorted.length === 0 ? (
        <Empty icon="calendar" title="Других броней нет" text="Экскурсии, мероприятия, рестораны, входные билеты, аренда — всё, что забронировано на конкретное время." />
      ) : (
        sorted.map((b) => {
          const price = b.price === null ? null : formatMoney(b.price, b.currency || 'RUB');
          return (
            <article key={b.id} className="card booking-card">
              <header className="row">
                <div className="booking-date">
                  {b.date ? (
                    <>
                      <b className="num">{Number(b.date.slice(8))}</b>
                      <span>{formatDate(b.date, false).split(' ')[1]?.slice(0, 3)}</span>
                    </>
                  ) : (
                    <Icon name="calendar" size={20} />
                  )}
                </div>
                <div className="grow">
                  <div className="strong ellipsis">{b.title}</div>
                  <div className="faint small ellipsis">
                    {BOOKING_LABEL[b.kind]}
                    {b.time ? `, ${b.time}` : ''}
                    {b.place ? `, ${b.place}` : ''}
                  </div>
                </div>
                <button type="button" className="circle-btn sm" onClick={() => setEdit(b)} aria-label="Изменить бронь">
                  <Icon name="edit" size={16} />
                </button>
              </header>
              {(b.confirmation || b.url || price) && (
                <footer className="row wrap ticket-foot">
                  {b.confirmation && <span className="pill">№ {b.confirmation}</span>}
                  <LinkOut url={b.url} label="Открыть" />
                  <span className="grow" />
                  {price && <span className="pill dark price">{price}</span>}
                </footer>
              )}
              {b.note && <p className="small muted note-text">{b.note}</p>}
              <AttachmentRow ownerId={b.id} />
            </article>
          );
        })
      )}
      {edit && <BookingForm value={edit} onClose={() => setEdit(null)} trip={trip} />}
    </section>
  );
}

export function BookingForm({ value, onClose, trip, initialFiles = [] }: { value: Stamped<GeneralBooking>; onClose: () => void; trip: Trip; initialFiles?: File[] }) {
  const toast = useToastFn();
  const { stops, cities } = useWorld();
  const [v, setV] = useState(value);
  const [price, setPrice] = useState(value.price === null ? '' : String(value.price));
  const [files, setFiles] = useState<File[]>(initialFiles);
  const set = <K extends keyof GeneralBooking>(k: K, x: GeneralBooking[K]) => setV((s) => ({ ...s, [k]: x }));
  return (
    <FormSheet
      title={value.id ? 'Бронь' : 'Новая бронь'}
      onClose={onClose}
      canSave={v.title.trim().length > 0}
      onSave={async () => {
        const placeChanged = v.place.trim() !== value.place.trim();
        const keep = !placeChanged && value.lat !== null ? { lat: value.lat, lon: value.lon } : { lat: null, lon: null };
        const saved = await store.saveBooking({ ...v, title: v.title.trim(), price: parsePrice(price), ...keep });
        await savePending(saved.tripId, 'booking', saved.id, files, toast);
        if (saved.place && (placeChanged || saved.lat === null)) {
          const tripStops = stops.filter((s) => s.tripId === trip.id).sort((a, b) => a.order - b.order);
          const stop = tripStops.find((s) => saved.date && s.startDate && s.startDate <= saved.date && (s.endDate ?? s.startDate) >= saved.date) ?? tripStops[0];
          const cityName = stop ? (cities.get(stop.cityId)?.name ?? '') : '';
          void locateAddress('bookings', saved.id, saved.place, cityName).then((r) =>
            toast(r === 'found' ? `${saved.title}: место найдено, флажок на карте` : r === 'offline' ? 'Место найдём на карте, когда появится интернет' : `${saved.title}: адрес не найден — уточните его`),
          );
        }
      }}
      onDelete={value.id ? () => store.deleteRecord('bookings', value.id as string) : undefined}
    >
      <div className="chips wrap-chips" role="group" aria-label="Тип брони">
        {BOOKING_KINDS.map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={v.kind === k} onClick={() => set('kind', k)}>
            {BOOKING_LABEL[k]}
          </button>
        ))}
      </div>
      <Field label="Что забронировано">
        <input className="input" value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Ватиканские музеи" />
      </Field>
      <div className="grid-2">
        <Field label="Дата">
          <input className="input" type="date" value={v.date ?? ''} onChange={(e) => set('date', e.target.value || null)} />
        </Field>
        <Field label="Время">
          <input className="input" type="time" value={v.time ?? ''} onChange={(e) => set('time', e.target.value || null)} />
        </Field>
      </div>
      <Field label="Место, адрес" hint={value.lat !== null && v.place === value.place ? 'Отмечено на карте флажком' : 'Укажите адрес — после сохранения он сам найдётся на карте'}>
        <input className="input" value={v.place} onChange={(e) => set('place', e.target.value)} />
      </Field>
      <Field label="Номер бронирования">
        <input className="input" value={v.confirmation} onChange={(e) => set('confirmation', e.target.value)} />
      </Field>
      <PriceFields price={price} currency={v.currency} setPrice={setPrice} setCurrency={(c) => set('currency', c)} />
      <Field label="Ссылка">
        <input className="input" type="url" inputMode="url" value={v.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Заметки">
        <textarea className="textarea" value={v.note} onChange={(e) => set('note', e.target.value)} />
      </Field>
      <AttachmentField tripId={v.tripId} ownerType="booking" ownerId={value.id ?? null} pending={files} setPending={setFiles} />
    </FormSheet>
  );
}

// ====================================================================== Documents & notes

export function DocsSection({ trip }: { trip: Trip }) {
  const notes = useLiveQuery(() => db.notes.where('tripId').equals(trip.id).toArray(), [trip.id], []);
  const files = useLiveQuery(() => db.attachments.where('tripId').equals(trip.id).toArray(), [trip.id], []);
  const [edit, setEdit] = useState<Stamped<TripNote> | null>(null);
  const [pending, setPending] = useState<File[]>([]);
  const byKind = (k: TripNote['kind']) => notes.filter((n) => n.kind === k);
  const allFiles = files.filter((f) => f.ownerType !== 'cover');
  return (
    <section className="stack">
      <div className="section-title">
        <h3 className="h2">Заметки</h3>
      </div>
      <div className="chips wrap-chips">
        {NOTE_KINDS.map((k) => (
          <button key={k} type="button" className="chip" onClick={() => setEdit({ tripId: trip.id, kind: k, title: '', body: '', url: '' })}>
            <Icon name={NOTE_ICON[k]} size={16} /> {NOTE_LABEL[k]}
          </button>
        ))}
      </div>
      {notes.length === 0 ? (
        <p className="faint small" style={{ margin: 0 }}>Важные адреса, контакты, ссылки и любые записи о поездке.</p>
      ) : (
        NOTE_KINDS.filter((k) => byKind(k).length).map((k) => (
          <div key={k} className="stack tight">
            <span className="muted small strong">{NOTE_LABEL[k]}</span>
            <div className="list">
              {byKind(k).map((n) => (
                <button key={n.id} type="button" className="list-row" onClick={() => setEdit(n)}>
                  <Icon name={NOTE_ICON[k]} size={20} />
                  <span className="grow">
                    <span className="t block ellipsis">{n.title || n.body.split('\n')[0] || n.url || 'Без названия'}</span>
                    {n.title && n.body && <span className="s block ellipsis">{n.body}</span>}
                    {n.url && <span className="s block ellipsis">{n.url}</span>}
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      <div className="section-title">
        <h3 className="h2">Файлы</h3>
        <span className="faint small">{countLabel(allFiles.length, 'файл', 'файла', 'файлов')}</span>
      </div>
      <AttachmentField tripId={trip.id} ownerType="trip" ownerId={trip.id} pending={pending} setPending={setPending} label="Документы поездки: страховка, визы, брони" />
      {allFiles.some((f) => f.ownerType !== 'trip') && (
        <div className="stack tight">
          <span className="muted small strong">Из билетов и броней</span>
          <div className="att-grid">
            {allFiles
              .filter((f) => f.ownerType !== 'trip')
              .map((f) => (
                <AttachmentTile key={f.id} att={f} />
              ))}
          </div>
        </div>
      )}
      {edit && <NoteForm value={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

function NoteForm({ value, onClose }: { value: Stamped<TripNote>; onClose: () => void }) {
  const [v, setV] = useState(value);
  const set = <K extends keyof TripNote>(k: K, x: TripNote[K]) => setV((s) => ({ ...s, [k]: x }));
  const ok = !!(v.title.trim() || v.body.trim() || v.url.trim());
  const placeholders: Record<TripNote['kind'], [string, string]> = {
    note: ['Заголовок', 'Текст заметки'],
    link: ['Название', 'Описание'],
    address: ['Что это (например, «Апартаменты»)', 'Адрес'],
    contact: ['Имя', 'Телефон, почта, мессенджер'],
  };
  return (
    <FormSheet
      title={NOTE_LABEL[v.kind]}
      onClose={onClose}
      canSave={ok}
      onSave={async () => {
        await store.saveNote(v);
      }}
      onDelete={value.id ? () => store.deleteRecord('notes', value.id as string) : undefined}
    >
      <Field label="Заголовок">
        <input className="input" value={v.title} onChange={(e) => set('title', e.target.value)} placeholder={placeholders[v.kind][0]} />
      </Field>
      {v.kind === 'link' && (
        <Field label="Ссылка">
          <input className="input" type="url" inputMode="url" value={v.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
        </Field>
      )}
      <Field label={v.kind === 'address' ? 'Адрес' : v.kind === 'contact' ? 'Контакты' : 'Текст'}>
        <textarea className="textarea" value={v.body} onChange={(e) => set('body', e.target.value)} placeholder={placeholders[v.kind][1]} />
      </Field>
      {v.kind === 'link' && safeUrl(v.url) && (
        <a className="btn glass-btn" href={safeUrl(v.url) as string} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={18} /> Открыть ссылку
        </a>
      )}
    </FormSheet>
  );
}

// ====================================================================== Checklist

const SUGGESTED = ['Купить билеты', 'Забронировать жильё', 'Проверить паспорт и визы', 'Оформить страховку', 'Собрать вещи'];

export function TasksSection({ trip }: { trip: Trip }) {
  const tasks = useLiveQuery(() => db.tasks.where('tripId').equals(trip.id).toArray(), [trip.id], []);
  const [title, setTitle] = useState('');
  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order);
  const add = async (t: string) => {
    const v = t.trim();
    if (!v) return;
    await store.saveTask({ tripId: trip.id, title: v, done: false, order: tasks.reduce((m, x) => Math.max(m, x.order + 1), 0) });
  };
  const missing = SUGGESTED.filter((s) => !tasks.some((t) => t.title === s));
  return (
    <section className="stack">
      <div className="section-title">
        <h3 className="h2">Чек-лист</h3>
        {tasks.length > 0 && (
          <span className="faint small num">
            {tasks.filter((t) => t.done).length} из {tasks.length}
          </span>
        )}
      </div>
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          void add(title).then(() => setTitle(''));
        }}
      >
        <Icon name="checklist" size={20} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Новая задача" aria-label="Новая задача" enterKeyHint="done" />
        <button type="submit" className="circle-btn sm lime" aria-label="Добавить задачу" disabled={!title.trim()}>
          <Icon name="plus" size={18} />
        </button>
      </form>
      {missing.length > 0 && (
        <div className="chips">
          {missing.map((s) => (
            <button key={s} type="button" className="chip" onClick={() => void add(s)}>
              <Icon name="plus" size={14} /> {s}
            </button>
          ))}
        </div>
      )}
      {sorted.length > 0 && (
        <div className="list">
          {sorted.map((t) => (
            <div key={t.id} className={`list-row task ${t.done ? 'done' : ''}`}>
              <button type="button" className="task-check" onClick={() => void store.saveTask({ ...t, done: !t.done })} aria-pressed={t.done} aria-label={t.title}>
                <Check on={t.done} />
                <span className="grow t">{t.title}</span>
              </button>
              <button type="button" className="icon-plain" aria-label={`Удалить: ${t.title}`} onClick={() => void store.deleteRecord('tasks', t.id)}>
                <Icon name="trash" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
