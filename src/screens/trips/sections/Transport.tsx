import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { db, store, useToday, useWorld } from '../../../app/world';
import { go } from '../../../app/router';
import { openTripDeals, tripFocus } from '../../feed/dealsContext';
import type { Stamped } from '../../../data/store';
import { formatDate } from '../../../domain/dates';
import { BOARDING_DEFAULTS, type AccommodationBooking, type Attachment, TRANSPORT_MODES, type TransportBooking, type Trip } from '../../../domain/model';
import { countryName } from '../../../geo/reference';
import { type Airport, loadAirports, searchAirports } from '../../../geo/airports';
import { readBarcode } from '../../../geo/barcode';
import { AIRLINES } from '../../../domain/bookingParser';
import { airlineCode, CLASSES, classOfCompartment, dateOfDay, hasNonLatin, iataIn, isFlightNumber, isIata, isPnr, isSeat, latinCode, parseBcbp, typeFlightNumber, typeGate, typeIata, typePnr, typeSeat } from '../../../domain/ticket';
import { BOARD_LABELS, TicketView } from '../TicketView';
import { Icon } from '../../../ui/Icon';
import { Empty, Field, Flag } from '../../../ui/kit';
import { type Currency, formatMoney } from '../../../domain/money';
import { AttachmentField, AttachmentRow, savePending } from '../Attachments';
import { MODE_ICON, MODE_LABEL, parsePrice, useRoute } from '../common';
import { FormSheet, LinkOut, PriceFields, SectionHead, text, useToastFn } from './shared';


export const emptyTransport = (tripId: string, currency: Currency): Stamped<TransportBooking> => ({
  tripId, mode: 'flight', carrier: '', number: '', from: '', to: '', departDate: null, departTime: null, arriveDate: null, arriveTime: null,
  confirmation: '', price: null, currency, url: '', note: '', ...BOARDING_DEFAULTS,
});

export function TransportSection({ trip }: { trip: Trip }) {
  const { settings } = useWorld();
  const list = useLiveQuery(() => db.transport.where('tripId').equals(trip.id).toArray(), [trip.id], []);
  const [edit, setEdit] = useState<Stamped<TransportBooking> | null>(null);
  const [view, setView] = useState<string | null>(null);
  const sorted = [...list].sort((a, b) => `${a.departDate ?? '9'}${a.departTime ?? ''}`.localeCompare(`${b.departDate ?? '9'}${b.departTime ?? ''}`));
  const viewing = view ? list.find((t) => t.id === view) : undefined;
  return (
    <section className="stack">
      <SectionHead title="Билеты" addLabel="Билет" onAdd={() => setEdit(emptyTransport(trip.id, settings.currency))} />
      {trip.startDate && <DealsButton trip={trip} />}
      {sorted.length === 0 ? (
        <Empty icon="ticket" title="Билетов пока нет" text="Самолёты, поезда, автобусы, паромы и аренда авто. Достаточно указать вид транспорта — остальное по желанию." />
      ) : (
        sorted.map((t) => <TicketCard key={t.id} t={t} onOpen={() => setView(t.id)} onEdit={() => setEdit(t)} />)
      )}
      {viewing && !edit && (
        <TicketView
          t={viewing}
          onClose={() => setView(null)}
          onEdit={() => setEdit(viewing)}
        />
      )}
      {edit && <TransportForm value={edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

/** «Выгодные забросы»: tickets from home to this trip's places, its dates highlighted. */
function DealsButton({ trip }: { trip: Trip }) {
  const route = useRoute(trip.id);
  const today = useToday();
  if (!trip.startDate || trip.startDate < today) return null;
  return (
    <button
      type="button"
      className="btn lime block deals-btn"
      onClick={() =>
        openTripDeals(
          tripFocus(trip.title, trip.startDate as string, trip.endDate ?? '', trip.countryIds, route.map((r) => r.city).filter((c): c is NonNullable<typeof c> => !!c)),
          go,
        )
      }
    >
      <Icon name="plane" size={18} /> Выгодные забросы
    </button>
  );
}

export function initials(s: string) {
  const w = s.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase() || '—';
}

/** Ticket card in the reference style: carrier, A ---✈--- B, times, dark price pill. Tap opens the boarding pass. */
export function TicketCard({ t, onOpen, onEdit }: { t: TransportBooking; onOpen: () => void; onEdit: () => void }) {
  const price = t.price === null ? null : formatMoney(t.price, t.currency || 'RUB');
  const code = airlineCode(t.number);
  return (
    <article
      className="ticket card tappable"
      role="button"
      tabIndex={0}
      aria-label={`Открыть билет ${[t.carrier || MODE_LABEL[t.mode], t.number].filter(Boolean).join(' ')}`}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
    >
      <header className="row">
        <span className="carrier-logo" aria-hidden="true">
          {code || (t.carrier ? initials(t.carrier) : <Icon name={MODE_ICON[t.mode]} size={20} />)}
        </span>
        <div className="grow">
          <div className="strong ellipsis">{t.carrier || (code && AIRLINES[code]) || MODE_LABEL[t.mode]}</div>
          <div className="faint small">
            {MODE_LABEL[t.mode]}
            {t.number ? `, ${t.number}` : ''}
            {t.seat ? ` · место ${t.seat}` : ''}
          </div>
        </div>
        <button
          type="button"
          className="circle-btn sm"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label="Изменить билет"
        >
          <Icon name="edit" size={16} />
        </button>
      </header>
      {(t.from || t.to) && (
        <div className="leg">
          <span className="leg-end">
            <b>{t.from || '—'}</b>
          </span>
          <span className="leg-line" aria-hidden="true">
            <i />
            <Icon name={MODE_ICON[t.mode]} size={20} />
            <i />
          </span>
          <span className="leg-end right">
            <b>{t.to || '—'}</b>
          </span>
        </div>
      )}
      {(t.departDate || t.departTime || t.arriveDate || t.arriveTime) && (
        <div className="times">
          <div>
            <b className="num">{t.departTime ?? '—'}</b>
            <span className="faint small">{formatDate(t.departDate)}</span>
          </div>
          <div className="right">
            <b className="num">{t.arriveTime ?? '—'}</b>
            <span className="faint small">{formatDate(t.arriveDate)}</span>
          </div>
        </div>
      )}
      <footer className="row wrap ticket-foot">
        {t.confirmation && <span className="pill">Бронь {t.confirmation}</span>}
        <LinkOut url={t.url} label="Ссылка" />
        <span className="grow" />
        {price && <span className="pill dark price">{price}</span>}
      </footer>
      {t.note && <p className="small muted note-text">{t.note}</p>}
      <AttachmentRow ownerId={t.id} />
    </article>
  );
}

/** Fills empty fields of a ticket from a boarding pass barcode. */
export function applyBcbp(v: Stamped<TransportBooking>, raw: string, near: string): Stamped<TransportBooking> {
  const b = parseBcbp(raw);
  if (!b) return { ...v, barcode: raw };
  const code = airlineCode(b.flight);
  return {
    ...v,
    barcode: raw,
    mode: 'flight',
    number: v.number || b.flight,
    carrier: v.carrier || (code && AIRLINES[code]) || '',
    from: v.from || b.from,
    to: v.to || b.to,
    confirmation: v.confirmation || b.pnr,
    seat: v.seat || b.seat,
    passenger: v.passenger || b.passenger,
    travelClass: v.travelClass || classOfCompartment(b.compartment),
    departDate: v.departDate ?? (b.dayOfYear ? dateOfDay(b.dayOfYear, near) : null),
  };
}

export function TransportForm({ value, onClose, initialFiles = [] }: { value: Stamped<TransportBooking>; onClose: () => void; initialFiles?: File[] }) {
  const { settings } = useWorld();
  const toast = useToastFn();
  const [v, setV] = useState<Stamped<TransportBooking>>(() => ({ ...BOARDING_DEFAULTS, ...value }));
  const [price, setPrice] = useState(value.price === null ? '' : String(value.price));
  const [files, setFilesRaw] = useState<File[]>(initialFiles);
  const [scanning, setScanning] = useState(false);
  const warned = useRef(false);
  const rawNumber = useRef(value.number);
  const [placeOk, setPlaceOk] = useState({ from: true, to: true });
  const set = <K extends keyof TransportBooking>(k: K, x: TransportBooking[K]) => setV((s) => ({ ...s, [k]: x }));
  const flight = v.mode === 'flight';
  const L = BOARD_LABELS[v.mode];
  const today = new Date().toISOString().slice(0, 10);

  const scan = async (list: Blob[], quiet: boolean) => {
    setScanning(true);
    try {
      for (const f of list) {
        const raw = await readBarcode(f);
        if (raw) {
          setV((s) => applyBcbp(s, raw, s.departDate ?? today));
          toast(parseBcbp(raw) ? 'Штрихкод посадочного считан — поля заполнены' : 'Код с билета считан');
          return;
        }
      }
      if (!quiet) toast('Штрихкод на файле не найден');
    } finally {
      setScanning(false);
    }
  };
  // A file added in the form is checked for a boarding pass barcode right away.
  const setFiles = (next: File[]) => {
    const added = next.filter((f) => !files.includes(f));
    setFilesRaw(next);
    if (added.length && !v.barcode) void scan(added, true);
  };
  useEffect(() => {
    if (initialFiles.length && !value.barcode) void scan(initialFiles, true);
  }, []);
  const savedFiles = useLiveQuery(() => (value.id ? db.attachments.where('ownerId').equals(value.id).toArray() : Promise.resolve([] as Attachment[])), [value.id], [] as Attachment[]);
  const scanSaved = async () => {
    const blobs: Blob[] = [...files];
    for (const a of savedFiles) {
      const b = await store.getBlob(a.id);
      if (b) blobs.push(Object.assign(b, { name: a.name }));
    }
    if (!blobs.length) return toast('Сначала прикрепите фото или PDF посадочного');
    await scan(blobs, false);
  };

  const bad = {
    number: flight && v.number !== '' && !isFlightNumber(v.number),
    confirmation: flight && v.confirmation !== '' && !isPnr(v.confirmation),
    seat: flight && v.seat !== '' && !isSeat(v.seat),
    from: flight && !placeOk.from,
    to: flight && !placeOk.to,
  };
  const valid = !Object.values(bad).some(Boolean);

  return (
    <FormSheet
      title={value.id ? 'Билет' : 'Новый билет'}
      onClose={onClose}
      canSave={valid}
      onSave={async () => {
        const saved = await store.saveTransport({
          ...v,
          number: v.number.trim(),
          passenger: v.passenger.trim(),
          price: parsePrice(price),
          currency: v.currency.trim() || settings.currency,
        });
        await savePending(saved.tripId, 'transport', saved.id, files, toast);
      }}
      onDelete={value.id ? () => store.deleteRecord('transport', value.id as string) : undefined}
    >
      <div className="mode-grid" role="group" aria-label="Вид транспорта">
        {TRANSPORT_MODES.map((m) => (
          <button key={m} type="button" className="mode" aria-pressed={v.mode === m} onClick={() => set('mode', m)}>
            <Icon name={MODE_ICON[m]} size={20} />
            <span>{MODE_LABEL[m]}</span>
          </button>
        ))}
      </div>
      <div className="grid-2">
        <Field label={v.mode === 'flight' ? 'Номер рейса' : v.mode === 'train' ? 'Номер поезда' : 'Номер'} hint={bad.number ? <span className="err">Формат: SU 2402 — латиница</span> : undefined}>
          <input
            className={`input ${bad.number ? 'invalid' : ''}`}
            value={v.number}
            onChange={(e) => {
              const typed = e.target.value;
              if (!flight) return set('number', typed);
              // Convert what was actually typed, not the already converted text: "С"+"У" must become SU, not C+Y.
              const shown = v.number;
              rawNumber.current = typed.startsWith(shown) && typed.length > shown.length ? rawNumber.current + typed.slice(shown.length) : typed;
              const raw = rawNumber.current;
              if (hasNonLatin(raw) && !warned.current) {
                warned.current = true;
                toast('Номер рейса пишется латиницей — переводим буквы автоматически');
              }
              const num = typeFlightNumber(raw);
              setV((s) => {
                const code = airlineCode(num);
                const auto = code ? AIRLINES[code] : undefined;
                const prevAuto = AIRLINES[airlineCode(s.number)];
                return { ...s, number: num, carrier: auto && (!s.carrier || s.carrier === prevAuto) ? auto : s.carrier };
              });
            }}
            placeholder={flight ? 'SU 2402' : v.mode === 'train' ? '020У' : ''}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            lang={flight ? 'en' : undefined}
            inputMode={flight ? 'text' : undefined}
            maxLength={flight ? 8 : 20}
          />
        </Field>
        <Field label="Перевозчик">
          <input className="input" value={v.carrier} onChange={(e) => set('carrier', text(e.target.value))} placeholder={v.mode === 'car' ? 'Sixt' : v.mode === 'train' ? 'РЖД' : 'Аэрофлот'} />
        </Field>
      </div>
      {flight ? (
        <div className="grid-2">
          <AirportField label="Откуда" value={v.from} onChange={(x) => set('from', x)} onValid={(ok) => setPlaceOk((s) => (s.from === ok ? s : { ...s, from: ok }))} />
          <AirportField label="Куда" value={v.to} onChange={(x) => set('to', x)} onValid={(ok) => setPlaceOk((s) => (s.to === ok ? s : { ...s, to: ok }))} />
        </div>
      ) : (
        <div className="grid-2">
          <Field label={v.mode === 'car' ? 'Где получить' : 'Откуда'}>
            <input className="input" value={v.from} onChange={(e) => set('from', e.target.value)} placeholder={v.mode === 'train' ? 'Москва Ленинградская' : 'Москва'} />
          </Field>
          <Field label={v.mode === 'car' ? 'Где сдать' : 'Куда'}>
            <input className="input" value={v.to} onChange={(e) => set('to', e.target.value)} placeholder={v.mode === 'train' ? 'Санкт-Петербург' : 'Рим'} />
          </Field>
        </div>
      )}
      <div className="grid-2">
        <Field label="Отправление">
          <input className="input" type="date" value={v.departDate ?? ''} onChange={(e) => set('departDate', e.target.value || null)} />
        </Field>
        <Field label="Время">
          <input className="input" type="time" value={v.departTime ?? ''} onChange={(e) => set('departTime', e.target.value || null)} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Прибытие">
          <input className="input" type="date" value={v.arriveDate ?? ''} min={v.departDate ?? undefined} onChange={(e) => set('arriveDate', e.target.value || null)} />
        </Field>
        <Field label="Время">
          <input className="input" type="time" value={v.arriveTime ?? ''} onChange={(e) => set('arriveTime', e.target.value || null)} />
        </Field>
      </div>
      <p className="faint tiny" style={{ margin: '-6px 4px 0' }}>
        {flight ? 'Время — местное, как в билете. Время в пути считается с учётом часовых поясов аэропортов.' : 'Время — местное, как в билете.'}
      </p>

      {v.mode !== 'car' && (
        <details className="paste" open={!!(v.seat || v.gate || v.passenger || v.terminal || v.boardingTime || v.travelClass)}>
          <summary>Посадочные данные</summary>
          <div className="stack tight">
            <Field label="Пассажир" hint={flight ? 'Латиницей, как в паспорте' : undefined}>
              <input
                className="input"
                value={v.passenger}
                onChange={(e) => set('passenger', flight ? e.target.value.toUpperCase().replace(/[^A-Z\s'-]/g, '') : e.target.value)}
                placeholder={flight ? 'IVANOV IVAN' : 'Иванов Иван'}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </Field>
            <div className="grid-2">
              <Field label={L.seat} hint={bad.seat ? <span className="err">Ряд и буква: 12A</span> : undefined}>
                <input
                  className={`input ${bad.seat ? 'invalid' : ''}`}
                  value={v.seat}
                  onChange={(e) => set('seat', flight ? typeSeat(e.target.value) : e.target.value)}
                  placeholder={flight ? '12A' : '07, место 15'}
                  autoCapitalize="characters"
                />
              </Field>
              <Field label={L.gate}>
                <input className="input" value={v.gate} onChange={(e) => set('gate', flight ? typeGate(e.target.value) : e.target.value)} placeholder={flight ? 'B12' : ''} autoCapitalize="characters" />
              </Field>
            </div>
            <div className="grid-2">
              <Field label={L.terminal}>
                <input className="input" value={v.terminal} onChange={(e) => set('terminal', flight ? latinCode(e.target.value).slice(0, 3) : e.target.value)} placeholder={flight ? 'D' : ''} autoCapitalize="characters" />
              </Field>
              <Field label={`${L.boarding} в`}>
                <input className="input" type="time" value={v.boardingTime ?? ''} onChange={(e) => set('boardingTime', e.target.value || null)} />
              </Field>
            </div>
            <div className="field">
              <span>Класс</span>
              <div className="row wrap">
                {CLASSES.map(([k, label]) => (
                  <button key={k} type="button" className="chip" aria-pressed={v.travelClass === k} onClick={() => set('travelClass', v.travelClass === k ? '' : k)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </details>
      )}

      <Field label={flight ? 'Код бронирования (PNR)' : 'Номер бронирования'} hint={bad.confirmation ? <span className="err">5–8 латинских букв и цифр</span> : undefined}>
        <input
          className={`input ${bad.confirmation ? 'invalid' : ''}`}
          value={v.confirmation}
          onChange={(e) => set('confirmation', flight ? typePnr(e.target.value) : e.target.value.toUpperCase())}
          placeholder={flight ? 'ABC123' : ''}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
        />
      </Field>
      <PriceFields price={price} currency={v.currency} setPrice={setPrice} setCurrency={(c) => set('currency', c)} />
      <Field label="Ссылка на билет">
        <input className="input" type="url" inputMode="url" value={v.url} onChange={(e) => set('url', e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Заметки">
        <textarea className="textarea" value={v.note} onChange={(e) => set('note', e.target.value)} />
      </Field>
      <AttachmentField tripId={v.tripId} ownerType="transport" ownerId={value.id ?? null} pending={files} setPending={setFiles} label="Билет: файл или фото" />
      <div className="barcode-row">
        <Icon name="scan" size={18} />
        <span className="grow small">{v.barcode ? (parseBcbp(v.barcode) ? 'Штрихкод посадочного считан' : 'Код с билета считан') : 'Штрихкод талона не считан'}</span>
        {v.barcode ? (
          <button type="button" className="link-btn small" onClick={() => set('barcode', '')}>
            Убрать
          </button>
        ) : (
          <button type="button" className="link-btn small" disabled={scanning} onClick={() => void scanSaved()}>
            {scanning ? 'Ищу…' : 'Считать с файла'}
          </button>
        )}
      </div>
    </FormSheet>
  );
}

/** An airport by its IATA code: type a code or a city (in Russian), pick from the list. */
export function AirportField({ label, value, onChange, onValid }: { label: string; value: string; onChange: (code: string) => void; onValid: (ok: boolean) => void }) {
  const [all, setAll] = useState<Map<string, Airport> | null>(null);
  const [q, setQ] = useState(() => iataIn(value) || value);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    let alive = true;
    loadAirports()
      .then((a) => alive && setAll(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const code = iataIn(value);
  const current = code ? all?.get(code) : undefined;
  const hits = focus && all && q.trim() && !(isIata(q) && q === code) ? searchAirports(all, q) : [];
  const invalid = !focus && q.trim() !== '' && !(isIata(q) && q === code);
  useEffect(() => onValid(!invalid), [invalid, onValid]);
  const pick = (a: Airport) => {
    onChange(a.iata);
    setQ(a.iata);
    setFocus(false);
  };
  return (
    <div className="field airport-field">
      <span>{label}</span>
      <input
        className={`input ${invalid ? 'invalid' : ''}`}
        value={q}
        placeholder="SVO или город"
        autoCorrect="off"
        spellCheck={false}
        aria-label={`${label}: код аэропорта`}
        onFocus={() => setFocus(true)}
        onBlur={() =>
          window.setTimeout(() => {
            setFocus(false);
            const t = q.trim();
            if (!t) return onChange('');
            const asCode = typeIata(t);
            if (/^[A-Za-zА-Яа-яЁё]{3}$/.test(t) && isIata(asCode) && all?.has(asCode)) {
              setQ(asCode);
              onChange(asCode);
            }
          }, 150)
        }
        onChange={(e) => {
          const t = e.target.value;
          // a Latin code is typed upper-case; a city name (Cyrillic) is kept for the search
          setQ(/^[A-Za-z]{0,3}$/.test(t) ? t.toUpperCase() : t);
          if (!t.trim()) onChange('');
        }}
      />
      <small className={invalid ? 'err' : 'faint'} style={{ paddingLeft: 4 }}>
        {invalid ? 'Выберите аэропорт из списка' : current ? `${current.city}, ${countryName(current.countryId)}` : code ? ' ' : 'Код из 3 латинских букв'}
      </small>
      {hits.length > 0 && (
        <div className="suggest" role="listbox">
          {hits.map((a) => (
            <button key={a.iata} type="button" role="option" aria-selected={false} className="suggest-row" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(a)}>
              <b className="num">{a.iata}</b>
              <span className="grow ellipsis">
                {a.city}
                <span className="faint tiny"> · {a.name}</span>
              </span>
              <Flag id={a.countryId} size="sm" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export const emptyStay = (tripId: string, currency: Currency): Stamped<AccommodationBooking> => ({
  tripId, kind: 'hotel', name: '', address: '', cityId: null, lat: null, lon: null, checkIn: null, checkOut: null, confirmation: '',
  price: null, currency, url: '', contact: '', note: '',
});
