import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, useWorld } from '../../app/world';
import { countLabel, formatDate } from '../../domain/dates';
import { CURRENCIES, CURRENCY_SIGN, type Currency, formatMoney, type Priced, tripCost } from '../../domain/money';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/kit';

type Groups = { transport: Priced[]; stays: Priced[]; bookings: Priced[]; expenses: Priced[] };
const EMPTY: Groups = { transport: [], stays: [], bookings: [], expenses: [] };

/** Priced records of every trip, grouped by trip. */
export function useAllTripPrices(): Map<string, Groups> {
  return (
    useLiveQuery(async () => {
      const [t, s, b, e] = await Promise.all([db.transport.toArray(), db.stays.toArray(), db.bookings.toArray(), db.expenses.toArray()]);
      const map = new Map<string, Groups>();
      const get = (id: string) => {
        let g = map.get(id);
        if (!g) map.set(id, (g = { transport: [], stays: [], bookings: [], expenses: [] }));
        return g;
      };
      for (const r of t) get(r.tripId).transport.push(r);
      for (const r of s) get(r.tripId).stays.push(r);
      for (const r of b) get(r.tripId).bookings.push(r);
      for (const r of e) get(r.tripId).expenses.push({ price: r.amount, currency: r.currency });
      return map;
    }, []) ?? new Map()
  );
}

export function useTripTotal(groups: Groups | undefined) {
  const { settings } = useWorld();
  return tripCost(groups ?? EMPTY, settings.currency, settings.rates);
}

const COLORS: Record<string, string> = { transport: 'var(--graphite)', stays: 'var(--lime-deep)', bookings: 'var(--ink-3)', expenses: '#e0a43a' };

/** Trip budget: total of tickets, stays and bookings in the chosen currency, with a split by category. */
export function BudgetCard({ tripId, onAdd }: { tripId: string; onAdd: () => void }) {
  const { settings } = useWorld();
  const [cur, setCur] = useState<Currency>(settings.currency);
  const groups = useAllTripPrices().get(tripId);
  const cost = tripCost(groups ?? EMPTY, cur, settings.rates);
  const priced = cost.lines.reduce((n, l) => n + l.count, 0);

  return (
    <section className="card budget" aria-label="Стоимость поездки">
      <div className="row between">
        <span className="muted small strong">Стоимость поездки</span>
        <Segmented
          label="Валюта суммы"
          className="currency-switch"
          value={cur}
          onChange={setCur}
          options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_SIGN[c] }))}
        />
      </div>
      {priced === 0 ? (
        <button type="button" className="budget-empty" onClick={onAdd}>
          <Icon name="ticket" size={20} />
          <span>Укажите цену у билетов, жилья или броней или добавьте расходы — здесь появится сумма поездки</span>
        </button>
      ) : (
        <>
          <div className="budget-total num">{formatMoney(cost.total, cur, false)}</div>
          <div className="budget-bar" aria-hidden="true">
            {cost.lines
              .filter((l) => l.total > 0)
              .map((l) => (
                <i key={l.key} style={{ flexGrow: l.total, background: COLORS[l.key] }} />
              ))}
          </div>
          <div className="budget-lines">
            {cost.lines.map((l) => (
              <div key={l.key} className="budget-line">
                <span className="dot" style={{ background: COLORS[l.key] }} />
                <span className="grow">
                  {l.label}
                  {l.count > 0 && <span className="faint"> · {l.count}</span>}
                </span>
                <b className="num">{l.total > 0 ? formatMoney(l.total, cur, false) : '—'}</b>
              </div>
            ))}
          </div>
          <p className="faint tiny" style={{ margin: 0 }}>
            {cost.unpriced > 0 ? `${countLabel(cost.unpriced, 'запись', 'записи', 'записей')} без цены. ` : ''}
            {cost.skipped.length > 0 ? `Не учтено в другой валюте: ${cost.skipped.map((s) => `${s.amount} ${s.currency}`).join(', ')}. ` : ''}
            Пересчёт по курсу {settings.ratesSource === 'cbr' ? 'ЦБ' : settings.ratesSource === 'manual' ? 'из настроек' : 'ЦБ'}
            {settings.ratesDate ? ` на ${formatDate(settings.ratesDate)}` : ''}: $ = {settings.rates.USD.toFixed(2)} ₽, € = {settings.rates.EUR.toFixed(2)} ₽.
          </p>
        </>
      )}
    </section>
  );
}
