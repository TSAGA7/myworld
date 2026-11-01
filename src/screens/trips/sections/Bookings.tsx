import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, store, useWorld } from '../../../app/world';
import type { Stamped } from '../../../data/store';
import { formatDate } from '../../../domain/dates';
import { BOOKING_KINDS, type GeneralBooking, type Trip } from '../../../domain/model';
import { Icon } from '../../../ui/Icon';
import { locateAddress } from '../../../geo/locate';
import { Empty, Field } from '../../../ui/kit';
import { formatMoney } from '../../../domain/money';
import { AttachmentField, AttachmentRow, savePending } from '../Attachments';
import { BOOKING_LABEL, parsePrice } from '../common';
import { emptyBooking } from './Stays';
import { FormSheet, LinkOut, PriceFields, SectionHead, useToastFn } from './shared';

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
