/**
 * Ticket fields by the world standards: flight numbers (IATA airline designator + up to 4 digits), airport codes
 * (3 Latin letters), booking references (PNR, 5–8 Latin letters/digits), seats (row + letter), and the IATA BCBP
 * barcode that every boarding pass carries.
 */

/** Cyrillic letters that look like Latin ones — typed by mistake on a Russian keyboard. */
const LOOKALIKE: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y', І: 'I', Ј: 'J', Ѕ: 'S',
};

/** Keys of the Russian ЙЦУКЕН layout → the Latin letters on the same keys (typed without switching the layout). */
const LAYOUT: Record<string, string> = {
  Й: 'Q', Ц: 'W', У: 'E', К: 'R', Е: 'T', Н: 'Y', Г: 'U', Ш: 'I', Щ: 'O', З: 'P', Ф: 'A', Ы: 'S', В: 'D', А: 'F', П: 'G', Р: 'H', О: 'J',
  Л: 'K', Д: 'L', Я: 'Z', Ч: 'X', С: 'C', М: 'V', И: 'B', Т: 'N', Ь: 'M',
};
/** Russian domestic airline codes written in Cyrillic on Russian tickets → IATA. */
const RU_AIRLINES: Record<string, string> = { СУ: 'SU', С7: 'S7', ДР: 'DP', ФВ: 'FV', ЮТ: 'UT', У6: 'U6' };

/**
 * Upper-case Latin letters and digits only. Cyrillic is converted: text made only of look-alike letters ("ТК") is read
 * as those letters, anything else ("ыг") as keys pressed on the Russian layout; other characters are dropped.
 */
export function latinCode(s: string, allowSpace = false): string {
  const up = s.toUpperCase();
  const cyr = [...up].filter((ch) => /[\u0400-\u04FF]/.test(ch));
  const lookalike = cyr.every((ch) => LOOKALIKE[ch]);
  let out = '';
  for (const ch of up) {
    const c = /[\u0400-\u04FF]/.test(ch) ? ((lookalike ? LOOKALIKE[ch] : LAYOUT[ch]) ?? '') : ch;
    if (/[A-Z0-9]/.test(c) || (allowSpace && c === ' ')) out += c;
  }
  return out;
}

/** Whether the text has letters that can't be part of a Latin code (other Cyrillic letters, say). */
export const hasNonLatin = (s: string) => [...s.toUpperCase()].some((ch) => /\p{L}/u.test(ch) && !/[A-Z]/.test(LOOKALIKE[ch] ?? ch));

/** While typing: "su2402" → "SU 2402". The airline designator is two characters, the number up to 4 digits + optional suffix. */
export function typeFlightNumber(s: string): string {
  const raw = s.trim().toUpperCase();
  const ru = RU_AIRLINES[raw.slice(0, 2)];
  const t = (ru ? ru + latinCode(raw.slice(2)) : latinCode(raw)).slice(0, 7);
  const m = t.match(/^([A-Z0-9]{2})([A-Z]?)(\d.*)?$/);
  if (!m) return t;
  // a 3-letter ICAO prefix ("AFL") is kept as typed
  if (m[2]) return t;
  return m[3] ? `${m[1]} ${m[3]}` : (m[1] as string);
}

export const FLIGHT_RE = /^(?:[A-Z]{2}|[A-Z]\d|\d[A-Z]) ?\d{1,4}[A-Z]?$/;
export const IATA_RE = /^[A-Z]{3}$/;
export const PNR_RE = /^[A-Z0-9]{5,8}$/;
export const SEAT_RE = /^\d{1,3}[A-Z]$/;

export const isFlightNumber = (s: string) => FLIGHT_RE.test(s.trim());
export const isIata = (s: string) => IATA_RE.test(s.trim());
export const isPnr = (s: string) => PNR_RE.test(s.trim());
export const isSeat = (s: string) => SEAT_RE.test(s.trim());

export const typeIata = (s: string) => latinCode(s).replace(/\d/g, '').slice(0, 3);
export const typePnr = (s: string) => latinCode(s).slice(0, 8);
export const typeSeat = (s: string) => latinCode(s).slice(0, 4);
export const typeGate = (s: string) => latinCode(s).slice(0, 5);

/** The airline designator of a flight number ("SU 2402" → "SU"). */
export const airlineCode = (flight: string) => flight.trim().match(/^([A-Z0-9]{2})(?=\s?\d)/)?.[1] ?? '';

/** The airport code inside a free-text place ("Москва, SVO" → "SVO"). */
export function iataIn(place: string): string {
  const t = place.trim();
  if (IATA_RE.test(t)) return t;
  const m = t.match(/(?:^|[\s,(])([A-Z]{3})(?:$|[\s,)])/g);
  return m ? (m[m.length - 1] as string).replace(/[\s,()]/g, '') : '';
}

export const CLASSES = [
  ['economy', 'Эконом'],
  ['premium', 'Комфорт'],
  ['business', 'Бизнес'],
  ['first', 'Первый'],
] as const;
export const classLabel = (c: string) => CLASSES.find(([k]) => k === c)?.[1] ?? c;

// ---------------------------------------------------------------- time zones and duration

/** Offset of a time zone from UTC at a given UTC moment, in minutes. */
export function tzOffset(tz: string, utcMs: number): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!);
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

/** UTC moment of a local wall-clock time in a time zone. */
export function localToUtc(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const [h, mi] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - tzOffset(tz, wall) * 60000;
  utc = wall - tzOffset(tz, utc) * 60000; // second pass settles DST edges
  return utc;
}

/**
 * Travel time in minutes from local departure to local arrival. With time zones of both ends the result is real;
 * without them the clocks are compared as is (correct within one time zone). Null if something is missing or the
 * result is not plausible.
 */
export function travelMinutes(
  dep: { date: string | null; time: string | null; tz?: string | null },
  arr: { date: string | null; time: string | null; tz?: string | null },
): number | null {
  if (!dep.time || !arr.time) return null;
  const dDate = dep.date ?? arr.date;
  const aDate = arr.date ?? dep.date;
  if (!dDate || !aDate) return null;
  const tzA = dep.tz && arr.tz ? dep.tz : 'UTC';
  const tzB = dep.tz && arr.tz ? arr.tz : 'UTC';
  let m = (localToUtc(aDate, arr.time, tzB) - localToUtc(dDate, dep.time, tzA)) / 60000;
  // arrival time without a date on the next morning
  if (m < 0 && !arr.date) m += 24 * 60;
  return m > 0 && m < 4 * 24 * 60 ? Math.round(m) : null;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} ч ${m} мин` : `${h} ч`) : `${m} мин`;
}

// ---------------------------------------------------------------- IATA BCBP (Bar Coded Boarding Pass)

export interface Bcbp {
  passenger: string;
  pnr: string;
  from: string;
  to: string;
  carrier: string;
  flight: string;
  /** Day of the year of the flight (1–366). */
  dayOfYear: number | null;
  compartment: string;
  seat: string;
}

/**
 * Mandatory fields of the first leg of an IATA BCBP string ("M1IVANOV/IVAN  EABC123 SVOFCOSU 2402 285Y012A0001 100").
 * Returns null if the text isn't a boarding pass barcode.
 */
export function parseBcbp(raw: string): Bcbp | null {
  const s = raw.replace(/\r?\n/g, '');
  if (!/^M[1-4]/.test(s) || s.length < 58) return null;
  const f = (a: number, b: number) => s.slice(a, b).trim();
  const from = f(30, 33);
  const to = f(33, 36);
  if (!IATA_RE.test(from) || !IATA_RE.test(to)) return null;
  const carrier = f(36, 39);
  const num = f(39, 44).replace(/^0+(?=\d)/, '');
  const day = Number(f(44, 47));
  const seat = f(48, 52).replace(/^0+(?=\d)/, '');
  const name = f(2, 22);
  const [last, first] = name.split('/');
  return {
    passenger: first ? `${first.trim()} ${last?.trim() ?? ''}`.trim() : name,
    pnr: f(23, 30),
    from,
    to,
    carrier,
    flight: carrier && num ? `${carrier} ${num}` : '',
    dayOfYear: Number.isFinite(day) && day >= 1 && day <= 366 ? day : null,
    compartment: f(47, 48),
    seat: SEAT_RE.test(seat) ? seat : '',
  };
}

/** IATA compartment codes → our classes. */
export function classOfCompartment(c: string): string {
  if (/[FAP]/.test(c)) return 'first';
  if (/[JCDIZR]/.test(c)) return 'business';
  if (/[WES]/.test(c)) return 'premium';
  return c ? 'economy' : '';
}

/** A date from a BCBP day-of-year, taking the year that puts it closest to `near` (YYYY-MM-DD). */
export function dateOfDay(day: number, near: string): string {
  const y0 = Number(near.slice(0, 4));
  const ref = Date.parse(`${near}T00:00:00Z`);
  let best = '';
  let bestDiff = Infinity;
  for (const y of [y0 - 1, y0, y0 + 1]) {
    const t = Date.UTC(y, 0, day);
    const diff = Math.abs(t - ref);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = new Date(t).toISOString().slice(0, 10);
    }
  }
  return best;
}
