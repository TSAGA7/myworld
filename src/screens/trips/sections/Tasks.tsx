import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, store } from '../../../app/world';
import { type Trip } from '../../../domain/model';
import { Icon } from '../../../ui/Icon';
import { Check } from '../../../ui/kit';

export const SUGGESTED = ['Купить билеты', 'Забронировать жильё', 'Проверить паспорт и визы', 'Оформить страховку', 'Собрать вещи'];

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
