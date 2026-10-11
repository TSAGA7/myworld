import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useToast } from '../../app/toast';
import { db, store, useToday, useWorld } from '../../app/world';
import type { Stamped } from '../../data/store';
import { formatDate, nights } from '../../domain/dates';
import { CATEGORY_LABEL, settle, summarizeExpenses } from '../../domain/expenses';
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, ME, type Trip } from '../../domain/model';
import { convert, CURRENCIES, CURRENCY_SIGN, type Currency, formatMoney, isCurrency } from '../../domain/money';
import { Icon } from '../../ui/Icon';
import { Check, Confirm, Empty, Field, Segmented, Sheet } from '../../ui/kit';
import { parsePrice } from './common';

const CAT_ICON: Record<ExpenseCategory, string> = { food: '🍝', transport: '🚕', stay: '🛏️', fun: '🎟️', shopping: '🛍️', connection: '📶', other: '🧾' };

/** Spending during the trip: quick entry, totals by day and category, a daily limit and who-owes-whom. */
export function ExpensesSection({ trip }: { trip: Trip }) {
  const { settings } = useWorld();
  const today = useToday();
  const list = useLiveQuery(() => db.expenses.where('tripId').equals(trip.id).toArray(), [trip.id], []);
  const [edit, setEdit] = useState<Stamped<Expense> | null>(null);
  const [members, setMembers] = useState(false);
  const [limit, setLimit] = useState(false);
  const cur = settings.currency;
  const sum = summarizeExpenses(list, cur, settings.rates);
  const people = [{ id: ME, name: settings.name ? `${settings.name} (я)` : 'Я' }, ...trip.members];
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '—';
  const inTrip = trip.startDate && trip.endDate && today >= trip.startDate && today <= trip.endDate;
  const defaultDate = inTrip ? today : (trip.startDate ?? today);
  const blank = (): Stamped<Expense> => ({ tripId: trip.id, date: defaultDate, category: 'food', amount: 0, currency: cur, note: '', paidBy: ME, splitWith: [] });

  const days = nights(trip.startDate, trip.endDate);
  const limitCur = (isCurrency(trip.dailyBudgetCurrency) ? trip.dailyBudgetCurrency : cur) as Currency;
  const dailyLimit = trip.dailyBudget !== null ? convert(trip.dailyBudget, limitCur, cur, settings.rates) : null;
  const todayTotal = sum.byDay.find((d) => d.date === today)?.total ?? 0;
  const { transfers } = settle(list, trip.members, cur, settings.rates);

  return (
    <section className="stack">
      <div className="section-title">
        <h3 className="h2">Расходы</h3>
        <button type="button" className="btn sm lime" onClick={() => setEdit(blank())}>
          <Icon name="plus" size={16} /> Расход
        </button>
      </div>

      <div className="card expense-summary">
        <div className="row between">
          <div>
            <span className="muted small">Потрачено в поездке</span>
            <div className="budget-total num">{formatMoney(sum.total, cur, false)}</div>
          </div>
          {days !== null && days > 0 && sum.total > 0 && <span className="pill num">≈ {formatMoney(sum.total / (days + 1), cur, false)} в день</span>}
        </div>
        {dailyLimit !== null && (
          <div className="stack tight">
            <div className="row between small">
              <span className="muted">{inTrip ? 'Сегодня' : 'Лимит в день'}</span>
              <span className="num">
                {inTrip ? `${formatMoney(todayTotal, cur, false)} из ` : ''}
                {formatMoney(dailyLimit, cur, false)}
              </span>
            </div>
            {inTrip && (
              <div className={`meter ${todayTotal > dailyLimit ? 'over' : ''}`}>
                <i style={{ width: `${Math.min(100, (todayTotal / dailyLimit) * 100)}%` }} />
              </div>
            )}
          </div>
        )}
        {sum.byCategory.length > 0 && (
          <div className="cat-list">
            {sum.byCategory.map((c) => (
              <div key={c.category} className="cat-row">
                <span aria-hidden="true">{CAT_ICON[c.category]}</span>
                <span className="grow">{CATEGORY_LABEL[c.category]}</span>
                <span className="cat-bar" aria-hidden="true">
                  <i style={{ width: `${(c.total / sum.total) * 100}%` }} />
                </span>
                <b className="num">{formatMoney(c.total, cur, false)}</b>
              </div>
            ))}
          </div>
        )}
        <div className="row wrap">
          <button type="button" className="btn sm ghost" onClick={() => setLimit(true)}>
            <Icon name="target" size={16} /> {trip.dailyBudget !== null ? 'Изменить лимит' : 'Лимит в день'}
          </button>
          <button type="button" className="btn sm ghost" onClick={() => setMembers(true)}>
            <Icon name="users" size={16} /> {trip.members.length ? `Участники: ${trip.members.length + 1}` : 'Участники'}
          </button>
        </div>
      </div>

      {trip.members.length > 0 && list.length > 0 && (
        <div className="card stack tight">
          <span className="muted small strong">Кто кому должен</span>
          {transfers.length === 0 ? (
            <span className="small">Все в расчёте 👌</span>
          ) : (
            transfers.map((t) => (
              <div key={`${t.from}-${t.to}`} className="row small">
                <b>{nameOf(t.from)}</b>
                <Icon name="chevron" size={14} />
                <b className="grow">{nameOf(t.to)}</b>
                <span className="pill dark num">{formatMoney(t.amount, cur, false)}</span>
              </div>
            ))
          )}
        </div>
      )}

      {list.length === 0 ? (
        <Empty icon="wallet" title="Расходов пока нет" text="Записывайте траты прямо в поездке: еда, такси, музеи, сувениры. Сумма появится в стоимости поездки." />
      ) : (
        sum.byDay.map((d) => (
          <div key={d.date ?? 'none'} className="stack tight">
            <div className="row between day-head">
              <span className="strong">{d.date ? formatDate(d.date, false) : 'Без даты'}</span>
              <span className="muted small num">{formatMoney(d.total, cur, false)}</span>
            </div>
            <div className="list">
              {d.items.map((e) => (
                <button key={e.id} type="button" className="list-row" onClick={() => setEdit(e)}>
                  <span className="exp-ic" aria-hidden="true">
                    {CAT_ICON[e.category]}
                  </span>
                  <span className="grow">
                    <span className="t block ellipsis">{e.note || CATEGORY_LABEL[e.category]}</span>
                    {trip.members.length > 0 && <span className="s block">Платил: {nameOf(e.paidBy)}</span>}
                  </span>
                  <b className="num">{formatMoney(e.amount, e.currency || 'RUB')}</b>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {edit && <ExpenseForm value={edit} trip={trip} people={people} onClose={() => setEdit(null)} />}
      {members && <MembersSheet trip={trip} onClose={() => setMembers(false)} />}
      {limit && <LimitSheet trip={trip} onClose={() => setLimit(false)} />}
    </section>
  );
}

function ExpenseForm({ value, trip, people, onClose }: { value: Stamped<Expense>; trip: Trip; people: Array<{ id: string; name: string }>; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState(value);
  const [amount, setAmount] = useState(value.amount ? String(value.amount) : '');
  const [del, setDel] = useState(false);
  const set = <K extends keyof Expense>(k: K, x: Expense[K]) => setV((s) => ({ ...s, [k]: x }));
  const parsed = parsePrice(amount);
  const save = async () => {
    if (parsed === null || parsed <= 0) return;
    await store.saveExpense({ ...v, amount: parsed });
    toast(value.id ? 'Расход изменён' : 'Расход добавлен');
    onClose();
  };
  const split = v.splitWith.length ? v.splitWith : people.map((p) => p.id);
  return (
    <Sheet
      title={value.id ? 'Расход' : 'Новый расход'}
      onClose={onClose}
      footer={
        <>
          {value.id && (
            <button type="button" className="btn danger" aria-label="Удалить расход" onClick={() => setDel(true)}>
              <Icon name="trash" size={18} />
            </button>
          )}
          <button type="button" className="btn dark" disabled={parsed === null || parsed <= 0} onClick={() => void save()}>
            Сохранить
          </button>
        </>
      }
    >
      <div className="amount-input">
        <input className="input amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label="Сумма" />
        <Segmented label="Валюта" className="currency-switch" value={(isCurrency(v.currency) ? v.currency : 'RUB') as Currency} onChange={(c) => set('currency', c)} options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_SIGN[c] }))} />
      </div>
      <div className="cat-grid" role="group" aria-label="Категория">
        {EXPENSE_CATEGORIES.map((c) => (
          <button key={c} type="button" className="mode" aria-pressed={v.category === c} onClick={() => set('category', c)}>
            <span style={{ fontSize: 20 }}>{CAT_ICON[c]}</span>
            <span>{CATEGORY_LABEL[c]}</span>
          </button>
        ))}
      </div>
      <Field label="Комментарий">
        <input className="input" value={v.note} onChange={(e) => set('note', e.target.value)} placeholder="Например, ужин в траттории" />
      </Field>
      <Field label="Дата">
        <input className="input" type="date" value={v.date ?? ''} min={trip.startDate ?? undefined} onChange={(e) => set('date', e.target.value || null)} />
      </Field>
      {people.length > 1 && (
        <>
          <div className="field">
            <span>Кто платил</span>
            <div className="chips wrap-chips">
              {people.map((p) => (
                <button key={p.id} type="button" className="chip" aria-pressed={v.paidBy === p.id} onClick={() => set('paidBy', p.id)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>На кого делить</span>
            <div className="list">
              {people.map((p) => {
                const on = split.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="list-row"
                    onClick={() => {
                      const next = on ? split.filter((x) => x !== p.id) : [...split, p.id];
                      if (next.length) set('splitWith', next.length === people.length ? [] : next);
                    }}
                  >
                    <Check on={on} />
                    <span className="grow t">{p.name}</span>
                    {on && parsed ? <span className="faint small num">{formatMoney(parsed / split.length, v.currency)}</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
      {del && value.id && (
        <Confirm
          title="Удалить расход?"
          confirmLabel="Удалить"
          danger
          onConfirm={async () => {
            await store.deleteRecord('expenses', value.id as string);
            onClose();
          }}
          onClose={() => setDel(false)}
        />
      )}
    </Sheet>
  );
}

function MembersSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const [name, setName] = useState('');
  const save = (members: Trip['members']) => store.saveTrip({ ...trip, members });
  return (
    <Sheet title="Участники поездки" onClose={onClose}>
      <p className="muted small" style={{ margin: 0 }}>
        Добавьте попутчиков — расходы можно будет делить, а приложение посчитает, кто кому должен. Пригласить их в поездку можно кнопкой «Поделиться поездкой».
      </p>
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim();
          if (!n) return;
          void save([...trip.members, { id: `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: n }]);
          setName('');
        }}
      >
        <Icon name="users" size={20} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя попутчика" aria-label="Имя попутчика" />
        <button type="submit" className="circle-btn sm lime" aria-label="Добавить" disabled={!name.trim()}>
          <Icon name="plus" size={18} />
        </button>
      </form>
      {trip.members.length > 0 && (
        <div className="list">
          {trip.members.map((m) => (
            <div key={m.id} className="list-row">
              <span className="avatar-mini">{m.name.slice(0, 1).toUpperCase()}</span>
              <span className="grow t">{m.name}</span>
              <button type="button" className="icon-plain" aria-label={`Убрать ${m.name}`} onClick={() => void save(trip.members.filter((x) => x.id !== m.id))}>
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function LimitSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { settings } = useWorld();
  const [amount, setAmount] = useState(trip.dailyBudget !== null ? String(trip.dailyBudget) : '');
  const [cur, setCur] = useState<Currency>((isCurrency(trip.dailyBudgetCurrency) ? trip.dailyBudgetCurrency : settings.currency) as Currency);
  return (
    <Sheet
      title="Лимит трат в день"
      onClose={onClose}
      footer={
        <>
          {trip.dailyBudget !== null && (
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                await store.saveTrip({ ...trip, dailyBudget: null, dailyBudgetCurrency: '' });
                onClose();
              }}
            >
              Убрать
            </button>
          )}
          <button
            type="button"
            className="btn dark"
            disabled={parsePrice(amount) === null}
            onClick={async () => {
              await store.saveTrip({ ...trip, dailyBudget: parsePrice(amount), dailyBudgetCurrency: cur });
              onClose();
            }}
          >
            Сохранить
          </button>
        </>
      }
    >
      <div className="amount-input">
        <input className="input amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label="Лимит в день" />
        <Segmented label="Валюта" className="currency-switch" value={cur} onChange={setCur} options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_SIGN[c] }))} />
      </div>
      <p className="faint small" style={{ margin: 0 }}>Во время поездки на экране расходов будет видно, сколько осталось на сегодня.</p>
    </Sheet>
  );
}
