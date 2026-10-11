import { countries as CL, languages as LANGS } from 'countries-list';
import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../app/toast';
import { db, store, useToday, useWorld } from '../../app/world';
import { formatDate } from '../../domain/dates';
import { type DayWeather, drivesLeft, packingList, summarizeWeather, VISA_DATA_DATE, VISA_LABEL, visaFor, type WeatherSummary } from '../../domain/hints';
import type { Trip } from '../../domain/model';
import { loadCatalog } from '../../geo/catalog';
import { weatherFor } from '../../geo/online';
import { COUNTRY_BY_ID, countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Flag } from '../../ui/kit';
import type { RouteStop } from './common';

const LANG_RU: Record<string, string> = {
  en: 'английский', ru: 'русский', it: 'итальянский', fr: 'французский', de: 'немецкий', es: 'испанский', pt: 'португальский', tr: 'турецкий', ar: 'арабский',
  zh: 'китайский', ja: 'японский', ko: 'корейский', th: 'тайский', vi: 'вьетнамский', el: 'греческий', sr: 'сербский', hr: 'хорватский', ka: 'грузинский',
  hy: 'армянский', az: 'азербайджанский', kk: 'казахский', uz: 'узбекский', ky: 'киргизский', tg: 'таджикский', be: 'белорусский', uk: 'украинский',
  pl: 'польский', cs: 'чешский', sk: 'словацкий', hu: 'венгерский', ro: 'румынский', bg: 'болгарский', nl: 'нидерландский', sv: 'шведский', no: 'норвежский',
  da: 'датский', fi: 'финский', et: 'эстонский', lv: 'латышский', lt: 'литовский', he: 'иврит', hi: 'хинди', id: 'индонезийский', ms: 'малайский',
  fa: 'персидский', mn: 'монгольский', sq: 'албанский', me: 'черногорский', bs: 'боснийский', mk: 'македонский', sl: 'словенский', ca: 'каталанский', ga: 'ирландский',
};
const CUR_RU: Record<string, string> = {
  EUR: 'евро', USD: 'доллар США', RUB: 'рубль', GBP: 'фунт стерлингов', CHF: 'швейцарский франк', TRY: 'турецкая лира', AED: 'дирхам ОАЭ', CNY: 'юань',
  JPY: 'иена', THB: 'бат', GEL: 'лари', AMD: 'драм', KZT: 'тенге', UZS: 'сум', KGS: 'сом', AZN: 'манат', BYN: 'белорусский рубль', RSD: 'сербский динар',
  EGP: 'египетский фунт', INR: 'индийская рупия', IDR: 'рупия', VND: 'донг', KRW: 'вона', CZK: 'чешская крона', PLN: 'злотый', HUF: 'форинт',
  SEK: 'шведская крона', NOK: 'норвежская крона', DKK: 'датская крона', ILS: 'шекель', BRL: 'реал', ARS: 'аргентинский песо', MXN: 'мексиканский песо',
  MAD: 'дирхам', TND: 'тунисский динар', LKR: 'шри-ланкийская рупия', MVR: 'руфия', MYR: 'ринггит', QAR: 'риал Катара', OMR: 'оманский риал', CUP: 'кубинский песо',
};

type WeatherState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'done'; kind: 'forecast' | 'climate'; summary: WeatherSummary | null; days: DayWeather[] };

/** Practical hints for the trip: entry rules, money and language, and the weather for the dates with a packing list. */
export function HintsSection({ trip, route }: { trip: Trip; route: RouteStop[] }) {
  const { settings } = useWorld();
  const today = useToday();
  const toast = useToast();
  const [capitals, setCapitals] = useState<Map<string, string>>(new Map());
  const [weather, setWeather] = useState<Record<string, WeatherState>>({});

  useEffect(() => {
    loadCatalog()
      .then((cat) => {
        const m = new Map<string, string>();
        for (const c of cat.byId.values()) if (c.capital && !m.has(c.countryId)) m.set(c.countryId, c.ru);
        setCapitals(m);
      })
      .catch(() => undefined);
  }, []);

  const stops = useMemo(() => route.filter((r) => r.city && r.city.lat !== null), [route]);
  const loadWeather = async () => {
    for (const r of stops) {
      const start = r.stop.startDate ?? trip.startDate;
      const end = r.stop.endDate ?? r.stop.startDate ?? trip.endDate ?? start;
      if (!start || !end || !r.city) continue;
      setWeather((w) => ({ ...w, [r.stop.id]: { status: 'loading' } }));
      try {
        const res = await weatherFor(r.city.lat as number, r.city.lon as number, start, end, today);
        setWeather((w) => ({ ...w, [r.stop.id]: { status: 'done', kind: res.kind, days: res.days, summary: summarizeWeather(res.days) } }));
      } catch (e) {
        setWeather((w) => ({ ...w, [r.stop.id]: { status: 'error', error: e instanceof Error ? e.message : String(e) } }));
      }
    }
  };

  const summaries = Object.values(weather).flatMap((w) => (w.status === 'done' && w.summary ? [w.summary] : []));
  const overall: WeatherSummary | null = summaries.length
    ? {
        min: Math.min(...summaries.map((s) => s.min)),
        max: Math.max(...summaries.map((s) => s.max)),
        avgMax: Math.round(summaries.reduce((a, s) => a + s.avgMax, 0) / summaries.length),
        rainyDays: summaries.reduce((a, s) => a + s.rainyDays, 0),
        days: summaries.reduce((a, s) => a + s.days, 0),
      }
    : null;

  const addPacking = async () => {
    const hasFlight = (await db.transport.where('tripId').equals(trip.id).toArray()).some((t) => t.mode === 'flight');
    const list = packingList(overall, { flight: hasFlight, drivesLeft: trip.countryIds.some(drivesLeft), beach: false });
    const existing = await db.tasks.where('tripId').equals(trip.id).toArray();
    let order = existing.reduce((m, t) => Math.max(m, t.order + 1), 0);
    let added = 0;
    for (const title of list) {
      if (existing.some((t) => t.title.toLowerCase() === title.toLowerCase())) continue;
      await store.saveTask({ tripId: trip.id, title, done: false, order: order++ });
      added++;
    }
    toast(added ? `В чек-лист добавлено: ${added}` : 'Всё уже есть в чек-листе');
  };

  if (trip.countryIds.length === 0) return <p className="muted">Добавьте страны или города в маршрут — здесь появятся подсказки.</p>;

  return (
    <section className="stack">
      <h3 className="h2">Подсказки</h3>
      {trip.countryIds.map((id) => {
        const iso = COUNTRY_BY_ID.get(id)?.iso2 ?? '';
        const info = (CL as Record<string, { phone: number[]; capital: string; currency: string[]; languages: string[] }>)[iso];
        const visa = settings.passport === 'RU' ? visaFor(id) : null;
        const langs = info?.languages.map((l) => LANG_RU[l] ?? (LANGS as Record<string, { native: string }>)[l]?.native ?? l) ?? [];
        return (
          <div key={id} className="card hint-card">
            <div className="row">
              <Flag id={id} size="lg" />
              <div className="grow">
                <div className="h3">{countryName(id)}</div>
                {capitals.get(id) && <div className="muted small">Столица — {capitals.get(id)}</div>}
              </div>
            </div>
            {settings.passport === 'RU' && (
              <div className={`visa ${visa?.status ?? 'unknown'}`}>
                <Icon name={visa?.status === 'free' ? 'check' : visa?.status === 'visa' ? 'info' : 'ticket'} size={18} />
                <div className="grow">
                  <b>{visa ? VISA_LABEL[visa.status] : 'Нет данных о визе'}</b>
                  <div className="small">
                    {visa?.note ? `${visa.note} ` : ''}
                    Для паспорта РФ, данные на {VISA_DATA_DATE}. Перед поездкой проверьте на сайте консульства.
                  </div>
                </div>
              </div>
            )}
            <div className="hint-grid">
              {info && info.currency.length > 0 && (
                <div>
                  <span className="faint tiny">Валюта</span>
                  <b>{info.currency.map((c) => CUR_RU[c] ?? c).join(', ')}</b>
                </div>
              )}
              {langs.length > 0 && (
                <div>
                  <span className="faint tiny">Язык</span>
                  <b>{langs.slice(0, 3).join(', ')}</b>
                </div>
              )}
              {info && info.phone.length > 0 && (
                <div>
                  <span className="faint tiny">Код страны</span>
                  <b>+{info.phone[0]}</b>
                </div>
              )}
              <div>
                <span className="faint tiny">Движение</span>
                <b>{drivesLeft(id) ? 'левостороннее' : 'правостороннее'}</b>
              </div>
            </div>
          </div>
        );
      })}

      <div className="card stack">
        <div className="row between">
          <h4 className="h3">Погода на даты поездки</h4>
          <button type="button" className="btn sm glass-btn" disabled={stops.length === 0} onClick={() => void loadWeather()}>
            <Icon name="cloud" size={16} /> {Object.keys(weather).length ? 'Обновить' : 'Узнать'}
          </button>
        </div>
        {stops.length === 0 && <span className="faint small">Добавьте в маршрут города с датами.</span>}
        {stops.map((r) => {
          const w = weather[r.stop.id];
          return (
            <div key={r.stop.id} className="weather-row">
              <span className="grow">
                <b>{r.city?.name}</b>
                <span className="faint small block">{r.stop.startDate ? formatDate(r.stop.startDate, false) : trip.startDate ? `с ${formatDate(trip.startDate, false)}` : 'без дат'}</span>
              </span>
              {!w || w.status === 'idle' ? (
                <span className="faint small">—</span>
              ) : w.status === 'loading' ? (
                <span className="spinner" />
              ) : w.status === 'error' ? (
                <span className="small" style={{ color: 'var(--danger)' }}>{w.error}</span>
              ) : w.summary ? (
                <span className="weather-val">
                  <b className="num">
                    {w.summary.min}…{w.summary.max}°
                  </b>
                  <span className="faint tiny">
                    {w.kind === 'forecast' ? 'прогноз' : 'обычно в эти дни'}
                    {w.summary.rainyDays ? `, дождь ${w.summary.rainyDays} дн.` : ', без дождей'}
                  </span>
                </span>
              ) : (
                <span className="faint small">нет данных</span>
              )}
            </div>
          );
        })}
        <span className="faint tiny">Данные Open-Meteo. Для дат дальше двух недель — погода в те же дни прошлого года.</span>
      </div>

      <div className="card stack">
        <h4 className="h3">Что взять с собой</h4>
        <ul className="pack-list">
          {packingList(overall, { flight: true, drivesLeft: trip.countryIds.some(drivesLeft), beach: false }).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {!overall && <span className="faint small">Нажмите «Узнать» погоду — список подстроится под температуру и дожди.</span>}
        <button type="button" className="btn dark" onClick={() => void addPacking()}>
          <Icon name="checklist" size={18} /> Добавить в чек-лист
        </button>
      </div>
    </section>
  );
}
