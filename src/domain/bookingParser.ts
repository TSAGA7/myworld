/**
 * Turns the text of a ticket or confirmation (recognised from a screenshot or taken from a PDF) into form fields.
 * Heuristics only: the user always checks the result before saving, nothing is saved automatically.
 */

export type ParsedKind = 'transport' | 'stay' | 'booking';
export interface ParsedBooking {
  kind: ParsedKind;
  mode: 'flight' | 'train' | 'bus' | 'ferry' | 'car' | 'other';
  title: string;
  carrier: string;
  number: string;
  from: string;
  to: string;
  dates: string[];
  times: string[];
  confirmation: string;
  price: number | null;
  currency: 'RUB' | 'USD' | 'EUR' | '';
  address: string;
  /** How sure the parser is about each field, for highlighting in the form. */
  found: string[];
}

const MONTHS: Array<[RegExp, number]> = [
  [/^янв|^jan/i, 1], [/^фев|^feb/i, 2], [/^мар|^mar/i, 3], [/^апр|^apr/i, 4], [/^ма[йя]|^may/i, 5], [/^июн|^jun/i, 6],
  [/^июл|^jul/i, 7], [/^авг|^aug/i, 8], [/^сен|^sep/i, 9], [/^окт|^oct/i, 10], [/^ноя|^nov/i, 11], [/^дек|^dec/i, 12],
];
const monthOf = (w: string) => MONTHS.find(([re]) => re.test(w))?.[1] ?? null;
const pad = (n: number) => String(n).padStart(2, '0');
const valid = (y: number, m: number, d: number) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31;

/** All dates in reading order, as YYYY-MM-DD. A missing year is taken from `refYear`. */
export function findDates(text: string, refYear: number): string[] {
  const out: Array<{ i: number; v: string }> = [];
  const push = (i: number, y: number, m: number, d: number) => valid(y, m, d) && out.push({ i, v: `${y}-${pad(m)}-${pad(d)}` });
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(m.index ?? 0, +m[1]!, +m[2]!, +m[3]!);
  for (const m of text.matchAll(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b/g)) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    push(m.index ?? 0, y, +m[2]!, +m[1]!);
  }
  // "10 сентября 2026", "10 Sep 2026", "10SEP26", "10 сен"
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})\s?([A-Za-zА-Яа-яё]{3,9})\.?,?(?:\s?(\d{4}|\d{2}(?!\d)))?(?![A-Za-zА-Яа-яё])/g)) {
    const mon = monthOf(m[2]!);
    if (!mon) continue;
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : refYear;
    push(m.index ?? 0, y, mon, +m[1]!);
  }
  // "Sep 10, 2026"
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s(\d{1,2}),?\s(\d{4})\b/g)) {
    const mon = monthOf(m[1]!);
    if (mon) push(m.index ?? 0, +m[3]!, mon, +m[2]!);
  }
  out.sort((a, b) => a.i - b.i);
  return [...new Set(out.map((x) => x.v))];
}

export function findTimes(text: string): string[] {
  const res: string[] = [];
  for (const m of text.matchAll(/(?<![\d:])([01]?\d|2[0-3])[:.]([0-5]\d)(?![\d:.])/g)) res.push(`${pad(+m[1]!)}:${m[2]}`);
  return res;
}

const CUR: Array<[RegExp, 'RUB' | 'USD' | 'EUR']> = [
  [/₽|руб|rub|р\./i, 'RUB'],
  [/\$|usd|долл/i, 'USD'],
  [/€|eur|евро/i, 'EUR'],
];

/** The largest amount next to a currency sign or a "total" word. */
export function findPrice(text: string): { price: number; currency: 'RUB' | 'USD' | 'EUR' | '' } | null {
  const num = String.raw`(\d{1,3}(?:[ \u00a0\u202f.,]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)`;
  const cands: Array<{ v: number; c: 'RUB' | 'USD' | 'EUR' | ''; total: boolean }> = [];
  const toNum = (s: string) => {
    const t = s.replace(/[ \u00a0\u202f]/g, '');
    // "1.250,50" / "1,250.50" / "1250,5"
    const last = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
    if (last >= 0 && t.length - last - 1 <= 2) return Number(t.slice(0, last).replace(/[.,]/g, '') + '.' + t.slice(last + 1));
    return Number(t.replace(/[.,]/g, ''));
  };
  const curOf = (s: string) => CUR.find(([re]) => re.test(s))?.[1] ?? '';
  for (const m of text.matchAll(new RegExp(String.raw`(₽|\$|€|RUB|USD|EUR)\s?` + num, 'gi'))) cands.push({ v: toNum(m[2]!), c: curOf(m[1]!), total: false });
  for (const m of text.matchAll(new RegExp(num + String.raw`\s?(₽|руб\.?|р\.|RUB|\$|USD|€|EUR|евро)`, 'gi'))) cands.push({ v: toNum(m[1]!), c: curOf(m[2]!), total: false });
  for (const line of text.split(/\n/)) {
    if (!/итого|всего|к оплате|стоимость|total|amount|price|сумма/i.test(line)) continue;
    const m = line.match(new RegExp(num));
    if (m) cands.push({ v: toNum(m[1]!), c: curOf(line), total: true });
  }
  const ok = cands.filter((c) => Number.isFinite(c.v) && c.v > 0 && c.v < 10_000_000);
  if (!ok.length) return null;
  const best = ok.filter((c) => c.total && c.c).sort((a, b) => b.v - a.v)[0] ?? ok.filter((c) => c.c).sort((a, b) => b.v - a.v)[0] ?? ok.sort((a, b) => b.v - a.v)[0];
  return best ? { price: best.v, currency: best.c } : null;
}

export const AIRLINES: Record<string, string> = {
  SU: 'Аэрофлот', S7: 'S7 Airlines', U6: 'Уральские авиалинии', DP: 'Победа', FV: 'Россия', UT: 'ЮТэйр', N4: 'Северный ветер', WZ: 'Red Wings',
  TK: 'Turkish Airlines', PC: 'Pegasus', EK: 'Emirates', FZ: 'flydubai', QR: 'Qatar Airways', EY: 'Etihad', LH: 'Lufthansa', AF: 'Air France',
  KL: 'KLM', BA: 'British Airways', LX: 'Swiss', AZ: 'ITA Airways', U2: 'easyJet', FR: 'Ryanair', W6: 'Wizz Air', CA: 'Air China',
  MU: 'China Eastern', CZ: 'China Southern', HY: 'Uzbekistan Airways', KC: 'Air Astana', J2: 'AZAL', A9: 'Georgian Airways', ZF: 'Azur Air',
};

export function parseBooking(text: string, refYear: number): ParsedBooking {
  const t = text.replace(/\r/g, '');
  const found: string[] = [];
  const r: ParsedBooking = {
    kind: 'booking', mode: 'other', title: '', carrier: '', number: '', from: '', to: '', dates: [], times: [],
    confirmation: '', price: null, currency: '', address: '', found,
  };
  const isHotel = /отел|гостиниц|hotel|check-?in|заезд|апартамент|apartment|hostel|хостел|booking\.com|ostrovok|островок|airbnb|номер в/i.test(t);
  const isTrain = /ржд|поезд|вагон|train|railway|место\s*\d|купе|плацкарт|ласточка|сапсан/i.test(t);
  const isBus = /автобус|bus\b|flixbus|автовокзал/i.test(t);
  const isFerry = /паром|ferry/i.test(t);
  const isCar = /аренд[аы] (авто|машин)|car rental|rent ?a ?car|pick-?up/i.test(t);
  const flightNo = t.match(/\b([A-Z][A-Z0-9]|[A-Z0-9][A-Z])\s?-?(\d{2,4})\b(?=[^\n]*?(?:\n|$))/);
  const isFlight = /рейс|flight|boarding|посадочн|аэропорт|airport|e-?ticket|электронный билет|авиа/i.test(t) || (!!flightNo && /\b[A-Z]{3}\b.*\b[A-Z]{3}\b/.test(t));

  if (isFlight && !isHotel) {
    r.kind = 'transport';
    r.mode = 'flight';
    const fn = [...t.matchAll(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?-?(\d{2,4})\b/g)].find((m) => AIRLINES[m[1]!] || /рейс|flight/i.test(t.slice(Math.max(0, (m.index ?? 0) - 25), m.index)));
    if (fn) {
      r.number = `${fn[1]} ${fn[2]}`;
      r.carrier = AIRLINES[fn[1]!] ?? '';
      found.push('number');
    }
    const iata = [...t.matchAll(/\b([A-Z]{3})\b/g)].map((m) => m[1]!).filter((c) => !/^(RUB|USD|EUR|PNR|THE|AND|FOR|VIA|PDF|SEP|OCT|NOV|DEC|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|ETK|TKT|NUM|ECO|BUS)$/.test(c));
    if (iata.length >= 2) {
      r.from = iata[0]!;
      r.to = iata.find((c) => c !== iata[0]) ?? '';
      found.push('from', 'to');
    }
  } else if (isTrain) {
    r.kind = 'transport';
    r.mode = 'train';
    const n = t.match(/поезд\s*№?\s*(\d{2,4}[А-ЯA-Z]?)/i) ?? t.match(/train\s*(?:no\.?|#)?\s*(\w{2,6})/i);
    if (n) {
      r.number = n[1]!;
      found.push('number');
    }
    r.carrier = /ржд/i.test(t) ? 'РЖД' : '';
    const st = t.match(/([А-ЯЁ][А-ЯЁа-яё.\- ]{2,40}?)\s*[—–-]>?\s*([А-ЯЁ][А-ЯЁа-яё.\- ]{2,40})/);
    if (st) {
      r.from = st[1]!.trim();
      r.to = st[2]!.trim();
      found.push('from', 'to');
    }
  } else if (isHotel) {
    r.kind = 'stay';
    const name = t.match(/(?:отель|гостиница|hotel|апартаменты|apartments?|hostel|хостел)[:\s]+([^\n]{3,60})/i);
    if (name) {
      r.title = name[1]!.trim();
      found.push('title');
    }
    const addr = t.match(/(?:адрес|address)[:\s]+([^\n]{5,120})/i);
    if (addr) {
      r.address = addr[1]!.trim();
      found.push('address');
    }
  } else {
    r.kind = isBus || isFerry || isCar ? 'transport' : 'booking';
    r.mode = isBus ? 'bus' : isFerry ? 'ferry' : isCar ? 'car' : 'other';
    const first = t.split('\n').map((l) => l.trim()).find((l) => l.length > 4 && !/^\d/.test(l));
    if (first) r.title = first.slice(0, 60);
  }

  const conf =
    t.match(/(?:номер (?:брони|бронирования|заказа)|код брони|бронирование\s*№|подтверждение|booking (?:reference|number|id)|confirmation(?: number| code)?|reservation(?: number| code)?|PNR|order)[:\s#№]*([A-Z0-9][A-Z0-9-]{4,14})/i) ??
    t.match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])([A-Z0-9]{6})\b/);
  if (conf) {
    r.confirmation = conf[1]!;
    found.push('confirmation');
  }
  r.dates = findDates(t, refYear);
  r.times = findTimes(t);
  if (r.dates.length) found.push('dates');
  if (r.times.length) found.push('times');
  const p = findPrice(t);
  if (p) {
    r.price = p.price;
    r.currency = p.currency;
    found.push('price');
  }
  return r;
}
