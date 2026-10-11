/** Money in the app: three currencies, rates as rubles per unit, totals per trip. */

export const CURRENCIES = ['RUB', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Rates = { USD: number; EUR: number };

export const CURRENCY_SIGN: Record<Currency, string> = { RUB: '₽', USD: '$', EUR: '€' };
export const CURRENCY_NAME: Record<Currency, string> = { RUB: 'Рубль', USD: 'Доллар', EUR: 'Евро' };

/** Official Bank of Russia rates on 3 October 2026, used until the user updates them. */
export const DEFAULT_RATES: Rates = { USD: 83.4839, EUR: 94.3201 };
export const DEFAULT_RATES_DATE = '2026-10-03';

export const isCurrency = (c: string): c is Currency => (CURRENCIES as readonly string[]).includes(c);

/** Rubles per one unit of the currency. */
const perUnit = (c: Currency, r: Rates): number => (c === 'RUB' ? 1 : r[c]);

export const convert = (amount: number, from: Currency, to: Currency, r: Rates): number =>
  from === to ? amount : (amount * perUnit(from, r)) / perUnit(to, r);

export interface Priced {
  price: number | null;
  currency: string;
}

export interface CostLine {
  key: 'transport' | 'stays' | 'bookings';
  label: string;
  /** Sum in the target currency. */
  total: number;
  count: number;
}

export interface TripCost {
  currency: Currency;
  total: number;
  lines: CostLine[];
  /** Records with a price in a currency the app cannot convert (left from older versions). */
  skipped: Array<{ amount: number; currency: string }>;
  /** Records without a price. */
  unpriced: number;
}

/** Sums tickets, stays and bookings of one trip in the target currency. */
export function tripCost(
  groups: { transport: readonly Priced[]; stays: readonly Priced[]; bookings: readonly Priced[] },
  to: Currency,
  rates: Rates,
): TripCost {
  const labels = { transport: 'Билеты', stays: 'Жильё', bookings: 'Брони' } as const;
  const skipped: TripCost['skipped'] = [];
  let unpriced = 0;
  const lines = (Object.keys(labels) as Array<keyof typeof labels>).map<CostLine>((key) => {
    let total = 0;
    let count = 0;
    for (const r of groups[key]) {
      if (r.price === null) {
        unpriced++;
        continue;
      }
      const cur = (r.currency || 'RUB').toUpperCase();
      if (!isCurrency(cur)) {
        skipped.push({ amount: r.price, currency: cur });
        continue;
      }
      total += convert(r.price, cur, to, rates);
      count++;
    }
    return { key, label: labels[key], total, count };
  });
  return { currency: to, total: lines.reduce((s, l) => s + l.total, 0), lines, skipped, unpriced };
}

/** "12 500 ₽", "1 250,5 $". */
export function formatMoney(amount: number, currency: string, fractions = true): string {
  const cur = currency.toUpperCase();
  const digits = cur === 'RUB' || !fractions ? 0 : 2;
  const n = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(amount);
  return `${n} ${isCurrency(cur) ? CURRENCY_SIGN[cur] : cur}`;
}
