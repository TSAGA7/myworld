import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../app/toast';
import { db, store } from '../../app/world';
import { AIRLINES } from '../../domain/bookingParser';
import { formatDate } from '../../domain/dates';
import type { TransportBooking } from '../../domain/model';
import { formatMoney } from '../../domain/money';
import { airlineCode, classLabel, formatDuration, iataIn, travelMinutes } from '../../domain/ticket';
import { type Airport, loadAirports } from '../../geo/airports';
import { Icon } from '../../ui/Icon';
import { GradientQr, svgToPng } from '../../ui/Qr';
import { MODE_ICON, MODE_LABEL } from './common';

type Mode = TransportBooking['mode'];

/** What the boarding fields are called for each kind of transport. */
export const BOARD_LABELS: Record<Mode, { number: string; gate: string; terminal: string; seat: string; boarding: string }> = {
  flight: { number: 'Рейс', gate: 'Выход', terminal: 'Терминал', seat: 'Место', boarding: 'Посадка' },
  train: { number: 'Поезд', gate: 'Платформа', terminal: 'Вагон', seat: 'Место', boarding: 'Посадка' },
  bus: { number: 'Рейс', gate: 'Перрон', terminal: 'Автовокзал', seat: 'Место', boarding: 'Посадка' },
  ferry: { number: 'Рейс', gate: 'Причал', terminal: 'Палуба', seat: 'Каюта/место', boarding: 'Посадка' },
  car: { number: 'Номер', gate: 'Стойка', terminal: 'Офис', seat: 'Машина', boarding: 'Выдача' },
  other: { number: 'Номер', gate: 'Выход', terminal: 'Терминал', seat: 'Место', boarding: 'Посадка' },
};

function initials(s: string) {
  const w = s.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? '') + (w[1]?.[0] ?? '')).toUpperCase() || '—';
}

/** Text put into the QR code when there's no barcode from the real pass: the booking in a readable form. */
function summary(t: TransportBooking) {
  return [
    [t.carrier, t.number].filter(Boolean).join(' '),
    [t.from, t.to].filter(Boolean).join(' → '),
    [t.departDate, t.departTime].filter(Boolean).join(' '),
    t.passenger,
    t.seat && `Seat ${t.seat}`,
    t.confirmation && `PNR ${t.confirmation}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** The ticket as a boarding pass: sky with a plane, carrier, vertical route with travel time, details grid and a QR code. */
export function TicketView({ t, onClose, onEdit }: { t: TransportBooking; onClose: () => void; onEdit: () => void }) {
  const toast = useToast();
  const [airports, setAirports] = useState<Map<string, Airport> | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);
  const files = useLiveQuery(() => db.attachments.where('ownerId').equals(t.id).toArray(), [t.id], []);
  const flight = t.mode === 'flight';
  const L = BOARD_LABELS[t.mode];

  useEffect(() => {
    if (!flight) return;
    let alive = true;
    loadAirports()
      .then((a) => alive && setAirports(a))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [flight]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const end = (place: string) => {
    const code = flight ? iataIn(place) : '';
    const ap = code ? airports?.get(code) : undefined;
    const rest = code ? place.replace(code, '').replace(/^[\s,()]+|[\s,()]+$/g, '') : '';
    return { code, big: code || place || '—', small: code ? rest || ap?.city || '' : '', airport: ap };
  };
  const a = end(t.from);
  const b = end(t.to);
  const minutes = travelMinutes(
    { date: t.departDate, time: t.departTime, tz: a.airport?.tz },
    { date: t.arriveDate, time: t.arriveTime, tz: b.airport?.tz },
  );
  const code = airlineCode(t.number);
  const carrier = t.carrier || (code && AIRLINES[code]) || MODE_LABEL[t.mode];
  const price = t.price === null ? null : formatMoney(t.price, t.currency || 'RUB');
  const qrText = t.barcode || summary(t);

  const cells: Array<[string, string]> = [
    ['Дата', t.departDate ? formatDate(t.departDate, false) : '—'],
    [L.gate, t.gate || '—'],
    [L.number, t.number || '—'],
    [L.boarding, t.boardingTime ?? '—'],
    [L.seat, t.seat || '—'],
    ['Класс', t.travelClass ? classLabel(t.travelClass) : '—'],
  ];
  if (t.terminal) cells.push([L.terminal, t.terminal]);
  if (t.confirmation) cells.push(['Бронь', t.confirmation]);
  if (t.passenger) cells.push(['Пассажир', t.passenger]);

  const openFile = async () => {
    const f = files[0];
    if (!f) return;
    const blob = await store.getBlob(f.id);
    if (!blob) return toast('Файл не найден на устройстве');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = f.name;
    link.target = '_blank';
    link.rel = 'noopener';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };
  const saveQr = async () => {
    const svg = qrRef.current?.querySelector('svg');
    const png = svg ? await svgToPng(svg, 1024) : null;
    if (!png) return toast('Не удалось сохранить картинку');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(png);
    link.download = `ticket-${(t.number || 'qr').replace(/\s/g, '')}.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 20_000);
    toast('QR-код сохранён');
  };
  const share = async () => {
    const text = summary(t);
    try {
      if (navigator.share) await navigator.share({ title: [carrier, t.number].filter(Boolean).join(' '), text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Данные билета скопированы');
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) toast('Не удалось поделиться');
    }
  };

  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <section className="tv" role="dialog" aria-modal="true" aria-label={`Билет ${[carrier, t.number].filter(Boolean).join(' ')}`}>
        <div className={`tv-sky ${t.mode}`}>
          <span className="cloud c1" />
          <span className="cloud c2" />
          <span className="cloud c3" />
          {flight ? <PlaneArt /> : <span className="tv-mode-art"><Icon name={MODE_ICON[t.mode]} size={96} weight={1.4} /></span>}
          <div className="tv-tools">
            <button type="button" className="circle-btn glass-btn" onClick={onClose} aria-label="Закрыть">
              <Icon name="close" size={20} />
            </button>
            <span className="grow" />
            <button type="button" className="circle-btn glass-btn" onClick={() => void share()} aria-label="Поделиться">
              <Icon name="share" size={19} />
            </button>
            <button type="button" className="circle-btn glass-btn" onClick={onEdit} aria-label="Изменить билет">
              <Icon name="edit" size={18} />
            </button>
          </div>
        </div>

        <div className="tv-card">
          <header className="tv-head">
            <span className="carrier-logo big" aria-hidden="true">
              {code || initials(carrier)}
            </span>
            <div className="grow">
              <div className="tv-carrier ellipsis">{carrier}</div>
              <div className="faint small">{[MODE_LABEL[t.mode], t.number].filter(Boolean).join(' · ')}</div>
            </div>
            {price && (
              <div className="tv-price">
                <span className="faint tiny">стоимость</span>
                <b className="num">{price}</b>
              </div>
            )}
          </header>

          <div className="tv-route">
            <div className="tv-stop">
              <i className="tv-dot" />
              <div className="grow">
                <b className={a.code ? 'tv-code' : 'tv-place'}>{a.big}</b>
                {a.small && <span className="muted">{a.small}</span>}
              </div>
              <div className="tv-time">
                <b className="num">{t.departTime ?? ''}</b>
                <span className="faint small">{t.departDate ? formatDate(t.departDate, false) : ''}</span>
              </div>
            </div>
            <div className="tv-mid">
              <span className="tv-line" aria-hidden="true">
                <Icon name={MODE_ICON[t.mode]} size={18} />
              </span>
              <span className="muted small">{minutes ? <>В пути <b className="ink">{formatDuration(minutes)}</b></> : 'Время в пути появится, когда будут указаны даты и время'}</span>
            </div>
            <div className="tv-stop">
              <i className="tv-dot end" />
              <div className="grow">
                <b className={b.code ? 'tv-code' : 'tv-place'}>{b.big}</b>
                {b.small && <span className="muted">{b.small}</span>}
              </div>
              <div className="tv-time">
                <b className="num">{t.arriveTime ?? ''}</b>
                <span className="faint small">{t.arriveDate ? formatDate(t.arriveDate, false) : ''}</span>
              </div>
            </div>
          </div>

          <dl className="tv-grid">
            {cells.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={v === '—' ? 'faint' : ''}>{v}</dd>
              </div>
            ))}
          </dl>

          <div className="tv-perf" aria-hidden="true" />

          <div className="tv-pass">
            <h3 className="h3">{flight ? 'Посадочный талон' : 'Билет'}</h3>
            <div className="tv-qr" ref={qrRef}>
              <GradientQr text={qrText} size={216} />
            </div>
            <p className="faint tiny center">
              {t.barcode
                ? 'Код собран из штрихкода вашего посадочного талона.'
                : 'В коде — данные брони для быстрого просмотра. Это не посадочный талон: на контроле покажите оригинал или прикрепите его файл — штрихкод считается автоматически.'}
            </p>
            {t.note && <p className="small muted">{t.note}</p>}
            <div className="grid-2">
              <button type="button" className="btn glass-btn" onClick={() => void saveQr()}>
                <Icon name="download" size={18} /> QR-код
              </button>
              {files.length ? (
                <button type="button" className="btn dark" onClick={() => void openFile()}>
                  <Icon name="file" size={18} /> Оригинал
                </button>
              ) : (
                <button type="button" className="btn dark" onClick={onEdit}>
                  <Icon name="paperclip" size={18} /> Прикрепить
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </>,
    document.body,
  );
}

/** A stylised airliner seen from below, climbing across the sky. */
function PlaneArt() {
  return (
    <svg className="tv-plane" viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="tvp-body" x1="0" x2="1">
          <stop offset="0" stopColor="#dfe6ef" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#cfd8e4" />
        </linearGradient>
        <linearGradient id="tvp-wing" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9d3df" />
        </linearGradient>
      </defs>
      <g transform="rotate(38 100 100)">
        <path d="M93 86 L18 122 L16 132 L93 112 Z M107 86 L182 122 L184 132 L107 112 Z" fill="url(#tvp-wing)" />
        <path d="M95 164 L72 182 L72 189 L97 181 Z M105 164 L128 182 L128 189 L103 181 Z" fill="url(#tvp-wing)" />
        <rect x="56" y="104" width="9" height="20" rx="4.5" fill="#b9c4d2" />
        <rect x="135" y="104" width="9" height="20" rx="4.5" fill="#b9c4d2" />
        <path d="M100 8 C108 8 109 26 109 40 L109 170 C109 182 104 192 100 194 C96 192 91 182 91 170 L91 40 C91 26 92 8 100 8 Z" fill="url(#tvp-body)" />
        <path d="M96 22 C98 18 102 18 104 22 L104 26 L96 26 Z" fill="#41505f" opacity="0.6" />
      </g>
    </svg>
  );
}
