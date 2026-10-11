import { convert, type Currency, isCurrency, type Rates } from './money';
import type { Expense, ExpenseCategory, Member } from './model';
import { ME } from './model';

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: 'Еда',
  transport: 'Транспорт',
  stay: 'Жильё',
  fun: 'Развлечения',
  shopping: 'Покупки',
  connection: 'Связь',
  other: 'Другое',
};

const toCur = (e: Pick<Expense, 'amount' | 'currency'>, to: Currency, r: Rates): number | null => {
  const c = (e.currency || 'RUB').toUpperCase();
  return isCurrency(c) ? convert(e.amount, c, to, r) : null;
};

export interface ExpenseSummary {
  total: number;
  byCategory: Array<{ category: ExpenseCategory; total: number }>;
  byDay: Array<{ date: string | null; total: number; items: Expense[] }>;
  /** Expenses in a currency the app cannot convert. */
  skipped: number;
}

export function summarizeExpenses(list: readonly Expense[], to: Currency, r: Rates): ExpenseSummary {
  let total = 0;
  let skipped = 0;
  const cat = new Map<ExpenseCategory, number>();
  const days = new Map<string, { date: string | null; total: number; items: Expense[] }>();
  for (const e of list) {
    const v = toCur(e, to, r);
    const key = e.date ?? '';
    const day = days.get(key) ?? { date: e.date, total: 0, items: [] };
    day.items.push(e);
    days.set(key, day);
    if (v === null) {
      skipped++;
      continue;
    }
    total += v;
    day.total += v;
    cat.set(e.category, (cat.get(e.category) ?? 0) + v);
  }
  const byDay = [...days.values()].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  for (const d of byDay) d.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    total,
    skipped,
    byCategory: [...cat.entries()].map(([category, t]) => ({ category, total: t })).sort((a, b) => b.total - a.total),
    byDay,
  };
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/**
 * Who owes whom. Each expense is split equally between `splitWith` (or all members),
 * the payer is credited; then debts are settled with the fewest transfers (greedy on the largest balances).
 */
export function settle(list: readonly Expense[], members: readonly Member[], to: Currency, r: Rates): { balances: Map<string, number>; transfers: Transfer[] } {
  const ids = [ME, ...members.map((m) => m.id).filter((id) => id !== ME)];
  const bal = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const e of list) {
    const v = toCur(e, to, r);
    if (v === null || v === 0) continue;
    const share = (e.splitWith.length ? e.splitWith : ids).filter((id) => bal.has(id));
    if (share.length === 0) continue;
    const payer = bal.has(e.paidBy) ? e.paidBy : ME;
    bal.set(payer, (bal.get(payer) ?? 0) + v);
    for (const id of share) bal.set(id, (bal.get(id) ?? 0) - v / share.length);
  }
  const debtors = [...bal].filter(([, v]) => v < -0.005).map(([id, v]) => ({ id, v: -v }));
  const creditors = [...bal].filter(([, v]) => v > 0.005).map(([id, v]) => ({ id, v }));
  const transfers: Transfer[] = [];
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i] as { id: string; v: number };
    const c = creditors[j] as { id: string; v: number };
    const amount = Math.min(d.v, c.v);
    if (amount > 0.005) transfers.push({ from: d.id, to: c.id, amount: Math.round(amount * 100) / 100 });
    d.v -= amount;
    c.v -= amount;
    if (d.v <= 0.005) i++;
    if (c.v <= 0.005) j++;
  }
  return { balances: bal, transfers };
}
