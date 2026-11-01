import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { focusOnMap } from '../../../app/router';
import { db, store, useWorld } from '../../../app/world';
import type { Stamped } from '../../../data/store';
import { countLabel, formatDate, nights } from '../../../domain/dates';
import { type GeneralBooking, type AccommodationBooking, STAY_KINDS, type Trip } from '../../../domain/model';
import { Icon } from '../../../ui/Icon';
import { locateAddress } from '../../../geo/locate';
import { Empty, Field } from '../../../ui/kit';
import { type Currency, formatMoney } from '../../../domain/money';
import { AttachmentField, AttachmentRow, savePending } from '../Attachments';
import { parsePrice, STAY_LABEL } from '../common';
import { emptyStay } from './Transport';
import { FormSheet, LinkOut, PriceFields, SectionHead, useToastFn } from './shared';

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


export const emptyBooking = (tripId: string, currency: Currency): Stamped<GeneralBooking> => ({
  tripId, kind: 'tour', title: '', date: null, time: null, place: '', lat: null, lon: null, confirmation: '', price: null, currency, url: '', note: '',
});
