import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, store } from '../../../app/world';
import type { Stamped } from '../../../data/store';
import { countLabel } from '../../../domain/dates';
import { NOTE_KINDS, type Trip, type TripNote } from '../../../domain/model';
import { Icon } from '../../../ui/Icon';
import { Field } from '../../../ui/kit';
import { AttachmentField, AttachmentTile } from '../Attachments';
import { NOTE_ICON, NOTE_LABEL, safeUrl } from '../common';
import { FormSheet } from './shared';

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

export function NoteForm({ value, onClose }: { value: Stamped<TripNote>; onClose: () => void }) {
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
