import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useToast } from '../../app/toast';
import { db, store, useToday, useWorld } from '../../app/world';
import type { Stamped } from '../../data/store';
import { formatDate } from '../../domain/dates';
import type { DiaryEntry, Trip } from '../../domain/model';
import { Icon } from '../../ui/Icon';
import { Confirm, Empty, Field, Sheet } from '../../ui/kit';
import { AttachmentField, AttachmentRow, savePending } from './Attachments';
import type { RouteStop } from './common';

/** Trip journal: a note per moment, with photos and the city it happened in. */
export function DiarySection({ trip, route }: { trip: Trip; route: RouteStop[] }) {
  const { cities } = useWorld();
  const today = useToday();
  const list = useLiveQuery(() => db.diary.where('tripId').equals(trip.id).toArray(), [trip.id], []);
  const [edit, setEdit] = useState<Stamped<DiaryEntry> | null>(null);
  const sorted = [...list].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.createdAt.localeCompare(a.createdAt));
  const cityOn = (date: string | null) =>
    date ? (route.find((r) => r.stop.startDate && r.stop.startDate <= date && (r.stop.endDate ?? r.stop.startDate) >= date)?.stop.cityId ?? null) : null;
  const inTrip = trip.startDate && trip.endDate && today >= trip.startDate && today <= trip.endDate;
  const blank = (): Stamped<DiaryEntry> => {
    const date = inTrip ? today : (trip.startDate ?? today);
    return { tripId: trip.id, date, cityId: cityOn(date) ?? route[0]?.stop.cityId ?? null, title: '', text: '' };
  };
  return (
    <section className="stack">
      <div className="section-title">
        <h3 className="h2">Дневник</h3>
        <button type="button" className="btn sm lime" onClick={() => setEdit(blank())}>
          <Icon name="plus" size={16} /> Запись
        </button>
      </div>
      {sorted.length === 0 ? (
        <Empty icon="book" title="Дневник пуст" text="Записывайте впечатления и прикрепляйте фото — через год будет что вспомнить." />
      ) : (
        <ol className="diary">
          {sorted.map((e) => (
            <li key={e.id} className="diary-item">
              <button type="button" className="card diary-card" onClick={() => setEdit(e)}>
                <div className="row between">
                  <span className="date-pill num">{e.date ? formatDate(e.date) : 'Без даты'}</span>
                  {e.cityId && cities.get(e.cityId) && (
                    <span className="muted small row">
                      <Icon name="pin" size={14} /> {cities.get(e.cityId)?.name}
                    </span>
                  )}
                </div>
                {e.title && <h4 className="h3">{e.title}</h4>}
                {e.text && <p className="diary-text">{e.text}</p>}
              </button>
              <AttachmentRow ownerId={e.id} />
            </li>
          ))}
        </ol>
      )}
      {edit && <DiaryForm value={edit} route={route} onClose={() => setEdit(null)} />}
    </section>
  );
}

function DiaryForm({ value, route, onClose }: { value: Stamped<DiaryEntry>; route: RouteStop[]; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(value);
  const [files, setFiles] = useState<File[]>([]);
  const [del, setDel] = useState(false);
  const set = <K extends keyof DiaryEntry>(k: K, x: DiaryEntry[K]) => setV((s) => ({ ...s, [k]: x }));
  const cityOptions = route.filter((r, i, a) => r.city && a.findIndex((x) => x.stop.cityId === r.stop.cityId) === i);
  const ok = !!(v.title.trim() || v.text.trim() || files.length);
  return (
    <Sheet
      title={value.id ? 'Запись' : 'Новая запись'}
      onClose={onClose}
      footer={
        <>
          {value.id && (
            <button type="button" className="btn danger" aria-label="Удалить запись" onClick={() => setDel(true)}>
              <Icon name="trash" size={18} />
            </button>
          )}
          <button
            type="button"
            className="btn dark"
            disabled={!ok}
            onClick={async () => {
              const saved = await store.saveDiary(v);
              await savePending(saved.tripId, 'diary', saved.id, files, toast);
              onClose();
            }}
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="grid-2">
        <Field label="Дата">
          <input className="input" type="date" value={v.date ?? ''} onChange={(e) => set('date', e.target.value || null)} />
        </Field>
        <Field label="Город">
          <select className="select" value={v.cityId ?? ''} onChange={(e) => set('cityId', e.target.value || null)}>
            <option value="">—</option>
            {cityOptions.map((r) => (
              <option key={r.stop.cityId} value={r.stop.cityId}>
                {r.city?.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Заголовок">
        <input className="input" value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Например, закат на Пьяццале Микеланджело" />
      </Field>
      <Field label="Что было">
        <textarea className="textarea tall" value={v.text} onChange={(e) => set('text', e.target.value)} placeholder="Впечатления, люди, вкусы, мысли" />
      </Field>
      <AttachmentField tripId={v.tripId} ownerType="diary" ownerId={value.id ?? null} pending={files} setPending={setFiles} label="Фото" />
      {del && value.id && (
        <Confirm
          title="Удалить запись?"
          text="Запись и её фото удалятся."
          confirmLabel="Удалить"
          danger
          onConfirm={async () => {
            await store.deleteRecord('diary', value.id as string);
            onClose();
          }}
          onClose={() => setDel(false)}
        />
      )}
    </Sheet>
  );
}
