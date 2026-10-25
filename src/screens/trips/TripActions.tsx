import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useToast } from '../../app/toast';
import { db, useToday, useWorld } from '../../app/world';
import { encodeBundle, packTrip, tripFile } from '../../data/shareTrip';
import { createShortCode } from '../../data/shortLink';
import type { Stamped } from '../../data/store';
import { parseBooking, type ParsedBooking } from '../../domain/bookingParser';
import { buildIcs, googleMapsUrl, type RoutePoint, twoGisUrl } from '../../domain/exportTrip';
import { type AccommodationBooking, BOARDING_DEFAULTS, type GeneralBooking, type TransportBooking, type Trip } from '../../domain/model';
import { isCurrency } from '../../domain/money';
import { formatDate } from '../../domain/dates';
import { extractText } from '../../geo/ocr';
import { Icon, type IconName } from '../../ui/Icon';
import { Segmented, Sheet } from '../../ui/kit';
import { MODE_LABEL, type RouteStop } from './common';
import { BookingForm, StayForm, TransportForm } from './TripSections';

type Sheet = 'import' | 'share' | 'export' | null;

export function TripActions({ trip, route }: { trip: Trip; route: RouteStop[] }) {
  const [open, setOpen] = useState<Sheet>(null);
  const tiles: Array<[Exclude<Sheet, null>, IconName, string]> = [
    ['import', 'scan', 'Импорт брони'],
    ['export', 'calendar', 'Календарь и карты'],
    ['share', 'users', 'Поделиться'],
  ];
  return (
    <>
      <div className="action-tiles">
        {tiles.map(([id, icon, label]) => (
          <button key={id} type="button" className="action-tile" onClick={() => setOpen(id)}>
            <span className="circle-btn sm">
              <Icon name={icon} size={18} />
            </span>
            <span>{label}</span>
          </button>
        ))}
      </div>
      {open === 'import' && <ImportSheet trip={trip} onClose={() => setOpen(null)} />}
      {open === 'share' && <ShareTripSheet trip={trip} onClose={() => setOpen(null)} />}
      {open === 'export' && <ExportSheet trip={trip} route={route} onClose={() => setOpen(null)} />}
    </>
  );
}

// ------------------------------------------------------------------ import from a screenshot or a PDF

type Draft =
  | { kind: 'transport'; value: Stamped<TransportBooking> }
  | { kind: 'stay'; value: Stamped<AccommodationBooking> }
  | { kind: 'booking'; value: Stamped<GeneralBooking> };

function toDraft(p: ParsedBooking, kind: ParsedBooking['kind'], tripId: string, defaultCurrency: string): Draft {
  const currency = p.currency && isCurrency(p.currency) ? p.currency : defaultCurrency;
  const [d1, d2] = p.dates;
  const [t1, t2] = p.times;
  if (kind === 'transport')
    return {
      kind,
      value: {
        tripId, mode: p.mode === 'other' ? 'flight' : p.mode, carrier: p.carrier, number: p.number, from: p.from, to: p.to,
        departDate: d1 ?? null, departTime: t1 ?? null, arriveDate: t2 ? (d2 ?? d1 ?? null) : (d2 ?? null), arriveTime: t2 ?? null,
        confirmation: p.confirmation, price: p.price, currency, url: '', note: '', ...BOARDING_DEFAULTS,
      },
    };
  if (kind === 'stay')
    return {
      kind,
      value: {
        tripId, kind: 'hotel', name: p.title || 'Жильё', address: p.address, cityId: null, lat: null, lon: null, checkIn: d1 ?? null, checkOut: d2 ?? null,
        confirmation: p.confirmation, price: p.price, currency, url: '', contact: '', note: '',
      },
    };
  return {
    kind,
    value: {
      tripId, kind: 'other', title: p.title || 'Бронь', date: d1 ?? null, time: t1 ?? null, place: p.address, lat: null, lon: null,
      confirmation: p.confirmation, price: p.price, currency, url: '', note: '',
    },
  };
}

function ImportSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { settings } = useWorld();
  const toast = useToast();
  const today = useToday();
  const [stage, setStage] = useState<{ text: string; ratio: number } | null>(null);
  const [parsed, setParsed] = useState<ParsedBooking | null>(null);
  const [kind, setKind] = useState<ParsedBooking['kind']>('transport');
  const [file, setFile] = useState<File | null>(null);
  const [paste, setPaste] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);

  const run = async (text: string, source: File | null) => {
    const p = parseBooking(text, Number((trip.startDate ?? today).slice(0, 4)));
    setParsed(p);
    setKind(p.kind);
    setFile(source);
    if (!text.trim()) toast('Текст не распознан — попробуйте более чёткий снимок');
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setStage({ text: 'Готовлю', ratio: 0 });
      const text = await extractText(f, (t, r) => setStage({ text: t, ratio: r }));
      await run(text, f);
    } catch (e) {
      toast(`Не удалось прочитать файл: ${e instanceof Error ? e.message : e}`);
    } finally {
      setStage(null);
    }
  };

  if (draft) {
    const files = file ? [file] : [];
    const close = () => onClose();
    if (draft.kind === 'transport') return <TransportForm value={draft.value} onClose={close} initialFiles={files} />;
    if (draft.kind === 'stay') return <StayForm value={draft.value} onClose={close} trip={trip} initialFiles={files} />;
    return <BookingForm value={draft.value} onClose={close} trip={trip} initialFiles={files} />;
  }

  const rows: Array<[string, string]> = parsed
    ? ([
        ['Перевозчик', parsed.carrier],
        ['Номер', parsed.number],
        ['Откуда → куда', [parsed.from, parsed.to].filter(Boolean).join(' → ')],
        ['Название', parsed.title],
        ['Адрес', parsed.address],
        ['Даты', parsed.dates.map((d) => formatDate(d)).join(', ')],
        ['Время', parsed.times.slice(0, 4).join(', ')],
        ['Бронь', parsed.confirmation],
        ['Цена', parsed.price !== null ? `${parsed.price} ${parsed.currency}` : ''],
      ].filter(([, v]) => v) as Array<[string, string]>)
    : [];

  return (
    <Sheet title="Импорт брони" onClose={onClose}>
      {!parsed && !stage && (
        <>
          <p className="muted" style={{ margin: 0 }}>
            Загрузите скриншот или PDF билета, брони отеля или экскурсии. Текст распознаётся прямо на телефоне — файл никуда не отправляется. Потом вы проверите поля и сохраните.
          </p>
          <div className="grid-2">
            <label className="btn lime">
              <Icon name="image" size={18} /> Скриншот
              <input type="file" accept="image/*" className="sr" onChange={(e) => void pick(e.target.files?.[0])} />
            </label>
            <label className="btn dark">
              <Icon name="file" size={18} /> PDF
              <input type="file" accept="application/pdf,.pdf" className="sr" onChange={(e) => void pick(e.target.files?.[0])} />
            </label>
          </div>
          <details className="paste">
            <summary>Или вставьте текст письма</summary>
            <textarea className="textarea" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Скопируйте текст подтверждения из почты" />
            <button type="button" className="btn glass-btn block" disabled={!paste.trim()} onClick={() => void run(paste, null)}>
              Разобрать текст
            </button>
          </details>
          <p className="faint tiny" style={{ margin: 0 }}>Первый импорт загрузит модуль распознавания (около 10 МБ), дальше он работает без интернета.</p>
        </>
      )}
      {stage && (
        <div className="stack">
          <span className="muted">{stage.text}…</span>
          <div className="meter">
            <i style={{ width: `${Math.round(stage.ratio * 100)}%` }} />
          </div>
        </div>
      )}
      {parsed && (
        <>
          <Segmented
            label="Что это"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'transport', label: 'Билет' },
              { value: 'stay', label: 'Жильё' },
              { value: 'booking', label: 'Бронь' },
            ]}
          />
          {rows.length ? (
            <div className="list">
              {rows.map(([k, v]) => (
                <div key={k} className="list-row">
                  <span className="muted small" style={{ width: 110, flex: 'none' }}>
                    {k}
                  </span>
                  <span className="grow strong">{v}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Ничего не удалось распознать. Можно заполнить форму вручную — файл прикрепится к записи.</p>
          )}
          <div className="grid-2">
            <button type="button" className="btn ghost" onClick={() => setParsed(null)}>
              Другой файл
            </button>
            <button type="button" className="btn lime" onClick={() => setDraft(toDraft(parsed, kind, trip.id, settings.currency))}>
              Проверить и сохранить
            </button>
          </div>
          {parsed.mode === 'flight' && kind === 'transport' && <p className="faint tiny" style={{ margin: 0 }}>{MODE_LABEL.flight}: время указано местное, как в билете.</p>}
        </>
      )}
    </Sheet>
  );
}

// ------------------------------------------------------------------ share with travel companions

function ShareTripSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { settings } = useWorld();
  const toast = useToast();
  const [busy, setBusy] = useState<'link' | 'file' | null>(null);
  // The link is made first and sent by a second tap: iPhone lets the share sheet open only right after a tap,
  // and a short link needs a moment of internet.
  const [link, setLink] = useState<string | null>(null);
  const text = `Поездка «${trip.title}» в MY WORLD`;
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Ссылка скопирована');
    } catch {
      toast('Не получилось скопировать — нажмите на ссылку и скопируйте её');
    }
  };
  const send = async (url: string) => {
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    await copy(url);
  };
  const makeLink = async () => {
    setBusy('link');
    try {
      const bundle = await packTrip(db, trip.id, settings.name);
      const base = `${location.origin}${location.pathname}#/join/`;
      let url: string;
      try {
        url = base + (await createShortCode(bundle));
      } catch {
        // No internet or the store is down: the long link carries everything itself and always works.
        url = base + (await encodeBundle(bundle));
        toast('Короткая ссылка сейчас недоступна — сделал полную');
      }
      setLink(url);
    } catch (e) {
      toast(`Не удалось: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };
  const shareFile = async () => {
    setBusy('file');
    try {
      const file = await tripFile(db, trip.id, settings.name);
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: trip.title });
          return;
        } catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') return;
        }
      }
      const href = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = href;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 30_000);
      toast('Файл поездки сохранён');
    } catch (e) {
      toast(`Не удалось: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet title="Поделиться поездкой" onClose={onClose}>
      <p className="muted" style={{ margin: 0 }}>
        Попутчики получат поездку со всем маршрутом, билетами, жильём, расходами и дневником. Если они что-то поменяют, пусть пришлют обратно — приложение объединит правки, ничего не задвоив.
      </p>
      {link ? (
        <div className="stack tight">
          <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Ссылка на поездку" />
          <div className="row">
            <button type="button" className="btn lime grow" onClick={() => void send(link)}>
              <Icon name="share" size={18} /> Отправить
            </button>
            <button type="button" className="btn glass-btn grow" onClick={() => void copy(link)}>
              Скопировать
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn lime block" disabled={!!busy} onClick={() => void makeLink()}>
          {busy === 'link' ? <span className="spinner" /> : <Icon name="link" size={18} />} {busy === 'link' ? 'Готовлю ссылку…' : 'Получить ссылку'}
        </button>
      )}
      <p className="faint small" style={{ margin: 0 }}>
        Короткая ссылка. Поездка в ней зашифрована, ключ — только в самой ссылке. Фото и документы по ссылке не передаются.
      </p>
      <button type="button" className="btn glass-btn block" disabled={!!busy} onClick={() => void shareFile()}>
        {busy === 'file' ? <span className="spinner" /> : <Icon name="download" size={18} />} Сохранить файлом
      </button>
      <p className="faint small" style={{ margin: 0 }}>
        Целиком, с обложкой, билетами и документами — чтобы перенести на другое устройство. Открыть: «Новое путешествие → Из файла».
      </p>
      <p className="faint small" style={{ margin: 0 }}>
        Участники для деления расходов добавляются во вкладке «Расходы».
      </p>
    </Sheet>
  );
}

// ------------------------------------------------------------------ calendar and maps

function ExportSheet({ trip, route, onClose }: { trip: Trip; route: RouteStop[]; onClose: () => void }) {
  const toast = useToast();
  const [which, setWhich] = useState<'cities' | 'places'>('cities');
  const recs = useLiveQuery(
    async () => ({
      transport: await db.transport.where('tripId').equals(trip.id).toArray(),
      stays: await db.stays.where('tripId').equals(trip.id).toArray(),
      bookings: await db.bookings.where('tripId').equals(trip.id).toArray(),
    }),
    [trip.id],
  );
  if (!recs) return null;
  const cityPts: RoutePoint[] = route.filter((r) => r.city && r.city.lat !== null).map((r) => ({ name: r.city?.name ?? '', lat: r.city?.lat as number, lon: r.city?.lon as number }));
  const placeList = [
    ...recs.stays.map((s) => ({ name: s.name, lat: s.lat, lon: s.lon, date: s.checkIn ?? '', address: s.address })),
    ...recs.bookings.map((b) => ({ name: b.title, lat: b.lat, lon: b.lon, date: `${b.date ?? ''}${b.time ?? ''}`, address: b.place })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const placePts: RoutePoint[] = placeList.filter((p) => p.lat !== null && p.lon !== null).map((p) => ({ name: p.name, lat: p.lat as number, lon: p.lon as number }));
  const unlocated = placeList.filter((p) => p.lat === null && p.address).length;
  const pts = which === 'cities' ? cityPts : placePts;

  const ics = () => {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const text = buildIcs(trip, route, recs.transport, recs.stays, recs.bookings, stamp, (m) => MODE_LABEL[m]);
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${trip.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'trip'}.ics`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    toast('Файл календаря готов — откройте его, чтобы добавить события');
  };
  const open = (url: string | null) => url && window.open(url, '_blank', 'noopener');

  return (
    <Sheet title="Календарь и карты" onClose={onClose}>
      <button type="button" className="list-row export-row" onClick={ics}>
        <span className="circle-btn sm lime">
          <Icon name="calendar" size={18} />
        </span>
        <span className="grow">
          <span className="t block">Добавить в календарь</span>
          <span className="s block">Рейсы, поезда, заезды в отели, экскурсии и города — файлом .ics для календаря iPhone, Google или Outlook</span>
        </span>
      </button>

      <div className="stack tight">
        <span className="muted small strong">Маршрут на карте</span>
        <Segmented
          label="Что показать"
          value={which}
          onChange={setWhich}
          options={[
            { value: 'cities', label: `Города · ${cityPts.length}` },
            { value: 'places', label: `Мои места · ${placePts.length}` },
          ]}
        />
        {which === 'places' && (
          <span className="faint small">
            Отели и брони с адресами — каждый станет точкой маршрута.
            {unlocated ? ` Ещё ${unlocated} адрес(а) не найдены на карте — откройте запись и проверьте адрес.` : ''}
          </span>
        )}
        <div className="grid-2">
          <button type="button" className="btn glass-btn" disabled={!pts.length} onClick={() => open(googleMapsUrl(pts))}>
            <Icon name="map" size={18} /> Google Карты
          </button>
          <button type="button" className="btn glass-btn" disabled={!pts.length} onClick={() => open(twoGisUrl(pts))}>
            <Icon name="map" size={18} /> 2ГИС
          </button>
        </div>
        {pts.length > 10 && <span className="faint tiny">В ссылку попадут первые 10 точек — так устроены Google Карты и 2ГИС.</span>}
        <span className="faint tiny">2ГИС подробно покрывает Россию, страны СНГ и ОАЭ; в других странах маршрут может не построиться.</span>
      </div>
    </Sheet>
  );
}
