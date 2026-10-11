/**
 * Travel hints that work offline: entry rules for a Russian passport, driving side, packing suggestions.
 * Entry rules change: the app shows the date of the data and asks to check the consulate before the trip.
 */

export const VISA_DATA_DATE = 'июнь 2026';
export type VisaStatus = 'free' | 'evisa' | 'arrival' | 'visa';

const FREE = 'AM AZ BY KZ KG UZ TJ GE MD RS ME BA TR IL AE QA OM TH VN MY PH LA MN CN BR AR CL PE EC CO UY PY VE CU NI BO GT HN DO JM MA TN MU SC ZA NA BW MZ MV';
const EVISA = 'IN LK KH TZ KE ET BH SA AU NZ';
const ARRIVAL = 'EG ID NP JO';
const VISA = 'AT BE BG HR CZ DK EE FI FR DE GR HU IS IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE CH GB IE US CA JP CY MX';

const NOTES: Record<string, string> = {
  CN: 'Пилотный безвизовый режим — проверьте, действует ли он на даты поездки.',
  AU: 'Электронная виза оформляется заранее и не всегда быстро.',
  NZ: 'Электронная виза оформляется заранее.',
  MX: 'Нужна виза Мексики или действующая виза США/Шенгена/Великобритании.',
  CY: 'Нужна виза; для коротких поездок возможна электронная про-виза.',
  EG: 'Виза по прилёту, на курортах Синая — бесплатный штамп на 15 дней.',
  TH: 'Без визы до 30 или 60 дней в зависимости от действующих правил.',
};

const toSet = (s: string) => new Set(s.split(' '));
const SETS: Array<[Set<string>, VisaStatus]> = [
  [toSet(FREE), 'free'],
  [toSet(EVISA), 'evisa'],
  [toSet(ARRIVAL), 'arrival'],
  [toSet(VISA), 'visa'],
];

export const VISA_LABEL: Record<VisaStatus, string> = {
  free: 'Без визы',
  evisa: 'Электронная виза',
  arrival: 'Виза по прилёту',
  visa: 'Нужна виза',
};

/** Entry rule for a Russian passport, or null when the app has no reliable data. */
export function visaFor(countryId: string, homeCountry = 'RU'): { status: VisaStatus; note: string } | null {
  if (homeCountry !== 'RU' || countryId === 'RU') return null;
  for (const [set, status] of SETS) if (set.has(countryId)) return { status, note: NOTES[countryId] ?? '' };
  return null;
}

const LEFT = toSet(
  'GB IE MT CY IN PK BD LK NP BT TH MY SG ID BN TL JP AU NZ PG FJ SB TO WS KI TV NR ZA NA BW ZW ZM MW MZ TZ KE UG LS SZ MU SC JM BS BB TT GY SR AG DM GD KN LC VC MV HK MO',
);
export const drivesLeft = (countryId: string): boolean => LEFT.has(countryId);

export interface DayWeather {
  date: string;
  tMax: number;
  tMin: number;
  rain: number;
}

export interface WeatherSummary {
  min: number;
  max: number;
  avgMax: number;
  rainyDays: number;
  days: number;
}

export function summarizeWeather(days: readonly DayWeather[]): WeatherSummary | null {
  if (days.length === 0) return null;
  const max = Math.max(...days.map((d) => d.tMax));
  const min = Math.min(...days.map((d) => d.tMin));
  const avgMax = days.reduce((s, d) => s + d.tMax, 0) / days.length;
  return { min: Math.round(min), max: Math.round(max), avgMax: Math.round(avgMax), rainyDays: days.filter((d) => d.rain >= 1).length, days: days.length };
}

/** Things to pack for the expected weather. */
export function packingList(w: WeatherSummary | null, opts: { flight: boolean; drivesLeft: boolean; beach: boolean }): string[] {
  const list = ['Паспорт и копия в телефоне', 'Страховка', 'Зарядка и пауэрбанк', 'Банковская карта и наличные'];
  if (opts.flight) list.push('Жидкости до 100 мл в ручной клади');
  if (w) {
    if (w.max >= 25) list.push('Солнцезащитный крем', 'Головной убор', 'Солнцезащитные очки');
    if (w.max >= 28 || opts.beach) list.push('Купальник/плавки');
    if (w.min <= 10) list.push('Тёплая куртка');
    if (w.min <= 0) list.push('Шапка и перчатки', 'Термобельё');
    if (w.min > 10 && w.min <= 16) list.push('Свитер или ветровка на вечер');
    if (w.rainyDays >= Math.max(1, Math.round(w.days / 4))) list.push('Зонт или дождевик', 'Непромокаемая обувь');
  }
  list.push('Удобная обувь для прогулок', 'Переходник для розетки');
  if (opts.drivesLeft) list.push('Помнить: левостороннее движение');
  return [...new Set(list)].filter((x) => x !== 'Помнить: левостороннее движение');
}
