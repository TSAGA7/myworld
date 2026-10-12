import { useEffect, useMemo, useRef, useState } from 'react';
import { holdLean } from '../../app/lean';
import { useToast } from '../../app/toast';
import { store, useToday, useWorld } from '../../app/world';
import { countLabel, formatDate, formatRange, plural } from '../../domain/dates';
import { type FoundTrip, findTrips, overlaps, type ResolvedPoint, summarize, tripTitle } from '../../domain/photoPlaces';
import { type Edits, NO_EDITS, type Place, placesToSave, reviewRows, type RowCity, type RowCountry, tripsToSave } from '../../domain/photoReview';
import { catalogToCity } from '../../geo/catalog';
import { createPhotoScanner } from '../../geo/photoClient';
import type { FoundPlace } from '../../geo/photoGeo';
import type { ScanProgress } from '../../geo/photoScan';
import { countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Check, Confirm, Flag, Sheet } from '../../ui/kit';
import { PlaceSearch } from '../../ui/PlaceSearch';

type Step =
  | { kind: 'pick' }
  /** The photo picker is open or the phone is still handing the photos over. */
  | { kind: 'waiting' }
  | { kind: 'error'; message: string }
  | { kind: 'reading'; progress: ScanProgress }
  | { kind: 'result' }
  | { kind: 'saved'; countries: number; cities: number; trips: number };

type Editing = { kind: 'country'; countryId: string } | { kind: 'city'; countryId: string; key: string } | { kind: 'add'; countryId: string };

// Explicit types: with a bare "image/*" iPhone converts every HEIC photo to JPEG before handing it over,
// which takes seconds per hundred photos. Listed HEIC is passed as it is.
const ACCEPT = 'image/heic,image/heif,image/jpeg,image/png,image/webp';
const CITY_PREVIEW = 10;

const toPlace = (p: FoundPlace): Place => ({
  id: p.id, name: p.ru, nameEn: p.en === p.ru ? '' : p.en, countryId: p.countryId, lat: p.lat, lon: p.lon, region: p.region, source: 'catalog',
});

/** «Отметить по фото»: the user picks photos, the app reads where and when they were taken — on the device, offline. */
export function PhotoImport({ onClose }: { onClose: () => void }) {
  const { world, settings, cities, trips } = useWorld();
  const today = useToday();
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [points, setPoints] = useState<ResolvedPoint[]>([]);
  const [places, setPlaces] = useState<Map<string, Place>>(new Map());
  const [stats, setStats] = useState({ total: 0, located: 0 });
  const [edits, setEdits] = useState<Edits>(NO_EDITS);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const seen = useRef(new Set<string>());
  const scanner = useMemo(() => createPhotoScanner(), []);

  // While this window is open the 3D globe is taken down: iOS keeps the page alive behind its photo picker.
  // The small city index (~3 MB) loads right away, so the analysis starts the moment the photos arrive.
  useEffect(() => {
    const release = holdLean();
    scanner.prepare().catch(() => undefined);
    return () => {
      release();
      scanner.dispose();
    };
  }, [scanner]);

  const hasResult = points.length > 0 || stats.total > 0;
  const backToList = () => setStep(hasResult ? { kind: 'result' } : { kind: 'pick' });

  const pick = async (list: FileList | null) => {
    const key = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
    const files = [...(list ?? [])].filter((f) => !seen.current.has(key(f)));
    if (!files.length) {
      if (list?.length) toast('Эти фото уже учтены');
      backToList();
      return;
    }
    setStep({ kind: 'reading', progress: { done: 0, total: files.length, located: 0, countries: [] } });
    try {
      const r = await scanner.scan(files, today, (progress) => setStep({ kind: 'reading', progress }));
      for (const f of files) seen.current.add(key(f));
      setPoints((p) => [...p, ...r.points]);
      setPlaces((m) => {
        const n = new Map(m);
        for (const p of r.places) n.set(p.id, toPlace(p));
        return n;
      });
      setStats((s) => ({ total: s.total + files.length, located: s.located + r.located }));
      setStep({ kind: 'result' });
    } catch (e) {
      setStep({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const homeCountryId = settings.homeCountryId ?? (settings.homeCityId ? (cities.get(settings.homeCityId)?.countryId ?? null) : null);
  const found = useMemo(() => summarize(points), [points]);
  const foundTrips = useMemo<FoundTrip[]>(
    () => (homeCountryId ? findTrips(points, homeCountryId).filter((t) => !trips.some((x) => overlaps(t, x.startDate, x.endDate))) : []),
    [points, homeCountryId, trips],
  );
  const rows = useMemo(() => reviewRows(found, places, edits), [found, places, edits]);
  const title = (t: FoundTrip) => tripTitle(t, countryName);

  const toggle = (key: string, children: string[] = []) =>
    setEdits((e) => {
      const off = new Set(e.off);
      const turnOff = !off.has(key);
      for (const k of [key, ...children]) {
        if (turnOff) off.add(k);
        else off.delete(k);
      }
      return { ...e, off };
    });
  const setDate = (key: string, date: string | null) => setEdits((e) => ({ ...e, dates: new Map(e.dates).set(key, date) }));
  const resetDate = (key: string) =>
    setEdits((e) => {
      const dates = new Map(e.dates);
      dates.delete(key);
      return { ...e, dates };
    });
  const replaceCity = (row: RowCity, city: Place) =>
    setEdits((e) => {
      if (row.manual) {
        const list = (e.extra.get(city.countryId) ?? []).map((m) => (`m:${m.id}` === row.key ? city : m));
        return { ...e, extra: new Map(e.extra).set(city.countryId, list) };
      }
      const id = row.key.slice(2);
      return { ...e, replace: new Map(e.replace).set(id, city) };
    });
  const addCity = (countryId: string, city: Place, date: string | null) =>
    setEdits((e) => {
      const list = e.extra.get(countryId) ?? [];
      if (list.some((m) => m.id === city.id) || rows.find((r) => r.countryId === countryId)?.cities.some((y) => y.city.id === city.id)) return e;
      const dates = new Map(e.dates);
      if (date) dates.set(`m:${city.id}`, date);
      return { ...e, extra: new Map(e.extra).set(countryId, [...list, city]), dates };
    });
  const removeManual = (countryId: string, key: string) =>
    setEdits((e) => ({ ...e, extra: new Map(e.extra).set(countryId, (e.extra.get(countryId) ?? []).filter((m) => `m:${m.id}` !== key)) }));

  const chosen = placesToSave(rows);
  const chosenTrips = foundTrips.filter((_, i) => !edits.off.has(`t:${i}`)).length;
  const chosenCountries = rows.filter((r) => r.on).length;
  const fresh = rows.filter((r) => r.on && !world.visitedCountryIds.has(r.countryId)).length;

  const save = async () => {
    setBusy(true);
    try {
      const r = await store.importPhotoPlaces({ places: chosen, trips: tripsToSave(foundTrips, places, edits, title) });
      setStep({ kind: 'saved', ...r });
    } catch (e) {
      toast(`Не удалось сохранить: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (step.kind === 'result' && chosen.length > 0) setConfirmClose(true);
    else onClose();
  };

  // One file input for the whole window that never unmounts: iPhone hands the photos over a moment after its picker
  // closes, and an input removed in between (by a screen change) would lose them.
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    // "cancel" — the picker was closed without photos (not a React event for inputs yet).
    const cancel = () => setStep((s) => (s.kind === 'waiting' ? (seen.current.size ? { kind: 'result' } : { kind: 'pick' }) : s));
    el.addEventListener('cancel', cancel);
    return () => el.removeEventListener('cancel', cancel);
  }, []);
  const openPicker = () => {
    input.current?.click();
    // The analysis screen is ready behind the picker: tapping ✓ lands straight on it.
    setStep({ kind: 'waiting' });
  };
  const picker = (label: string, cls: string) => (
    <button type="button" className={`btn ${cls}`} onClick={openPicker}>
      <Icon name="image" size={18} /> {label}
    </button>
  );

  const editRow = editing ? rows.find((r) => r.countryId === editing.countryId) : undefined;

  let body: JSX.Element;
  let footer: JSX.Element | undefined;
  let heading = 'Отметить по фото';
  if (step.kind === 'waiting' || step.kind === 'reading') {
    body = <Scanning progress={step.kind === 'reading' ? step.progress : null} />;
    footer =
      step.kind === 'waiting' ? (
        <button type="button" className="btn ghost grow" onClick={backToList}>
          Отмена
        </button>
      ) : undefined;
  } else if (step.kind === 'error') {
    body = (
      <div className="stack">
        <div className="card stack tight">
          <b>Не получилось разобрать фото</b>
          <p className="muted small" style={{ margin: 0 }}>{step.message}</p>
        </div>
      </div>
    );
    footer = (
      <>
        <button type="button" className="btn ghost" onClick={backToList}>
          Назад
        </button>
        {picker('Выбрать снова', 'lime grow')}
      </>
    );
  } else if (step.kind === 'saved') {
    heading = 'Готово';
    body = (
      <div className="photo-done">
        <span className="photo-done-icon">
          <Icon name="check" size={40} weight={2.6} />
        </span>
        <p className="h3" style={{ margin: 0 }}>Отмечено на карте</p>
        <p className="muted" style={{ margin: 0 }}>
          {[
            step.countries ? `${countLabel(step.countries, 'новая страна', 'новые страны', 'новых стран')}` : null,
            step.cities ? `${countLabel(step.cities, 'новый город', 'новых города', 'новых городов')}` : null,
            step.trips ? countLabel(step.trips, 'поездка', 'поездки', 'поездок') : null,
          ]
            .filter(Boolean)
            .join(', ') || 'Всё уже было отмечено — даты уточнены'}
        </p>
      </div>
    );
    footer = (
      <button type="button" className="btn lime grow" onClick={onClose}>
        Закрыть
      </button>
    );
  } else if (step.kind === 'pick') {
    body = (
      <div className="stack">
        <p className="muted" style={{ margin: 0 }}>
          Выберите фото из путешествий — можно сразу много: в окне выбора проведите пальцем по снимкам. Приложение найдёт по геометкам страны и города,
          а по датам — поездки. Перед сохранением всё можно поправить: даты, города, лишнее снять.
        </p>
        <p className="faint small" style={{ margin: 0 }}>
          Фото не загружаются в интернет и не сохраняются — читаются только место и дата съёмки.
        </p>
      </div>
    );
    footer = picker('Выбрать фото', 'lime grow');
  } else {
    heading = 'Найдено по фото';
    const nCities = rows.reduce((n, c) => n + c.cities.length, 0);
    body = (
      <>
        <div className="sync-summary three">
          <div>
            <b className="num">{rows.length}</b>
            <span>{plural(rows.length, 'страна', 'страны', 'стран')}</span>
          </div>
          <div>
            <b className="num">{nCities}</b>
            <span>{plural(nCities, 'город', 'города', 'городов')}</span>
          </div>
          <div>
            <b className="num">{foundTrips.length}</b>
            <span>{plural(foundTrips.length, 'поездка', 'поездки', 'поездок')}</span>
          </div>
        </div>
        <p className="faint small" style={{ margin: 0 }}>
          С геометкой {stats.located} из {stats.total} фото. Нажмите на страну или город, чтобы поправить дату или город.
        </p>

        {stats.located === 0 && (
          <div className="card stack tight">
            <b>В выбранных фото нет геопозиции</b>
            <p className="muted small" style={{ margin: 0 }}>
              Так бывает со скриншотами и сохранёнными картинками. В окне выбора iPhone есть фильтр «С геопозицией» — выберите снимки через него.
            </p>
          </div>
        )}

        {foundTrips.length > 0 && (
          <section className="stack tight">
            <h3 className="h3">Поездки</h3>
            <div className="list">
              {foundTrips.map((t, i) => (
                <button key={`${t.start}-${i}`} type="button" className="list-row" onClick={() => toggle(`t:${i}`)}>
                  <Check on={!edits.off.has(`t:${i}`)} />
                  <span className="grow">
                    <span className="t block ellipsis">{title(t)}</span>
                    <span className="s block ellipsis">
                      {formatRange(t.start, t.end)} · {t.stops.length ? countLabel(t.stops.length, 'город', 'города', 'городов') : 'без городов'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <p className="faint small" style={{ margin: 0 }}>Создадутся поездки с маршрутом и датами. Совпадающие по датам с вашими не предлагаются.</p>
          </section>
        )}
        {!homeCountryId && rows.length > 0 && (
          <p className="faint small" style={{ margin: 0 }}>
            Чтобы находить поездки, укажите домашний город в профиле — тогда снимки за границей сложатся в поездки по датам.
          </p>
        )}

        {rows.length > 0 && (
          <section className="stack tight">
            <h3 className="h3">Страны и города</h3>
            <div className="list">
              {rows.map((c) => (
                <CountryRow
                  key={c.key}
                  row={c}
                  already={world.visitedCountryIds.has(c.countryId)}
                  visitedCity={(id) => world.visitedCityIds.has(id)}
                  expanded={open.has(c.countryId)}
                  onExpand={() => setOpen((s) => new Set(s.has(c.countryId) ? [...s].filter((x) => x !== c.countryId) : [...s, c.countryId]))}
                  onToggle={() => toggle(c.key, c.cities.map((y) => y.key))}
                  onEdit={() => setEditing({ kind: 'country', countryId: c.countryId })}
                  onCity={(y) => setEditing({ kind: 'city', countryId: c.countryId, key: y.key })}
                  onAdd={() => setEditing({ kind: 'add', countryId: c.countryId })}
                />
              ))}
            </div>
            <p className="faint small" style={{ margin: 0 }}>
              Выбрано: {countLabel(chosenCountries, 'страна', 'страны', 'стран')}
              {fresh ? ` (новых ${fresh})` : ''}, {countLabel(chosen.filter((p) => p.city).length, 'город', 'города', 'городов')}. У уже отмеченных мест
              дата станет раньше, если фото старше.
            </p>
          </section>
        )}
      </>
    );
    footer =
      rows.length === 0 ? (
        picker('Выбрать другие фото', 'lime grow')
      ) : (
        <>
          {picker('Ещё фото', 'ghost')}
          <button type="button" className="btn lime grow" disabled={busy || chosen.length + chosenTrips === 0} onClick={() => void save()}>
            {busy ? 'Сохраняем…' : 'Отметить'}
          </button>
        </>
      );
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="sr"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const list = e.target.files;
          void pick(list).finally(() => {
            e.target.value = '';
          });
        }}
      />
      <Sheet title={heading} onClose={close} footer={footer}>
        {body}
      </Sheet>
      {editing && editRow && (
        <PlaceEditor
          editing={editing}
          row={editRow}
          today={today}
          onClose={() => setEditing(null)}
          onCountryDate={(d) => setDate(editRow.key, d)}
          onResetDate={resetDate}
          onCityDate={setDate}
          onToggle={(key) => (key === editRow.key ? toggle(key, editRow.cities.map((y) => y.key)) : toggle(key))}
          onReplace={replaceCity}
          onAdd={(city, d) => addCity(editRow.countryId, city, d)}
          onRemove={(key) => removeManual(editRow.countryId, key)}
        />
      )}
      {confirmClose && (
        <Confirm
          title="Закрыть без сохранения?"
          text="Найденные страны и города не будут отмечены. Чтобы сохранить, нажмите «Отметить»."
          confirmLabel="Закрыть"
          danger
          onConfirm={onClose}
          onClose={() => setConfirmClose(false)}
        />
      )}
    </>
  );
}

/** Scanning screen: a turning globe, the counter, and flags of the countries as they turn up. */
function Scanning({ progress }: { progress: ScanProgress | null }) {
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="photo-scan" role="status" aria-live="polite">
      <div className="scan-globe" aria-hidden="true">
        <svg viewBox="0 0 120 120">
          <defs>
            <clipPath id="scan-clip">
              <circle cx="60" cy="60" r="50" />
            </clipPath>
          </defs>
          <circle cx="60" cy="60" r="50" className="g-sea" />
          <g clipPath="url(#scan-clip)">
            <g className="g-spin">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <ellipse key={i} cx="60" cy="60" rx="50" ry="50" className="g-meridian" style={{ animationDelay: `${-i * 0.5}s` }} />
              ))}
            </g>
            {[30, 45, 60, 75, 90].map((y) => (
              <line key={y} x1="0" x2="120" y1={y} y2={y} className="g-parallel" />
            ))}
            <rect x="0" y="0" width="120" height="26" className="g-sweep" />
          </g>
          <circle cx="60" cy="60" r="50" className="g-rim" />
        </svg>
        <span className="scan-ring" />
        <span className="scan-ring late" />
        <span className="scan-photo a">
          <Icon name="image" size={18} />
        </span>
        <span className="scan-photo b">
          <Icon name="pin" size={18} />
        </span>
      </div>
      <p className="h3" style={{ margin: 0 }}>{progress ? 'Изучаем фото' : 'Получаем фото от телефона'}</p>
      {progress ? (
        <>
          <p className="muted" style={{ margin: 0 }}>
            <b className="num">{progress.done}</b> из <b className="num">{progress.total}</b> · с геометкой <b className="num">{progress.located}</b>
          </p>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i style={{ width: `${Math.max(3, pct)}%` }} />
          </div>
          {progress.countries.length > 0 && (
            <div className="scan-flags">
              {progress.countries.map((id) => (
                <span key={id} className="scan-flag">
                  <Flag id={id} size="sm" />
                  {countryName(id)}
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>iPhone передаёт снимки — при сотне фото это несколько секунд.</p>
      )}
      <p className="faint small" style={{ margin: 0 }}>Всё считается на телефоне, фото никуда не отправляются.</p>
    </div>
  );
}

function CountryRow({
  row,
  already,
  visitedCity,
  expanded,
  onExpand,
  onToggle,
  onEdit,
  onCity,
  onAdd,
}: {
  row: RowCountry;
  already: boolean;
  visitedCity: (id: string) => boolean;
  expanded: boolean;
  onExpand: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onCity: (y: RowCity) => void;
  onAdd: () => void;
}) {
  const shown = expanded ? row.cities : row.cities.slice(0, CITY_PREVIEW);
  return (
    <div className="photo-country" data-off={!row.on}>
      <div className="list-row">
        <button type="button" className="icon-plain" onClick={onToggle} aria-label={row.on ? 'Не отмечать' : 'Отмечать'}>
          <Check on={row.on} />
        </button>
        <button type="button" className="photo-country-main" onClick={onEdit}>
          <Flag id={row.countryId} />
          <span className="grow">
            <span className="t block ellipsis">{countryName(row.countryId)}</span>
            <span className="s block ellipsis">
              {[already ? 'уже отмечена' : 'новая', row.date ? `с ${formatDate(row.date)}` : 'без даты', row.photos ? countLabel(row.photos, 'фото', 'фото', 'фото') : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
          <Icon name="edit" size={18} className="faint" />
        </button>
      </div>
      {row.on && (
        <div className="photo-cities">
          {shown.map((y) => (
            <button key={y.key} type="button" className="chip" aria-pressed={y.on} onClick={() => onCity(y)}>
              {y.on && <Icon name="check" size={14} />} <span className="ellipsis">{y.city.name}</span>
              {visitedCity(y.city.id) && <span className="count">✓</span>}
            </button>
          ))}
          {row.cities.length > CITY_PREVIEW && (
            <button type="button" className="link-btn" onClick={onExpand}>
              {expanded ? 'Свернуть' : `ещё ${row.cities.length - CITY_PREVIEW}`}
            </button>
          )}
          <button type="button" className="chip add-chip" onClick={onAdd}>
            <Icon name="plus" size={14} /> город
          </button>
        </div>
      )}
    </div>
  );
}

/** Small editor over the list: the date of a country or a city, another city instead of the found one, or a city added by hand. */
function PlaceEditor({
  editing,
  row,
  today,
  onClose,
  onCountryDate,
  onResetDate,
  onCityDate,
  onToggle,
  onReplace,
  onAdd,
  onRemove,
}: {
  editing: Editing;
  row: RowCountry;
  today: string;
  onClose: () => void;
  onCountryDate: (d: string | null) => void;
  onResetDate: (key: string) => void;
  onCityDate: (key: string, d: string | null) => void;
  onToggle: (key: string) => void;
  onReplace: (row: RowCity, city: Place) => void;
  onAdd: (city: Place, date: string | null) => void;
  onRemove: (key: string) => void;
}) {
  const city = editing.kind === 'city' ? row.cities.find((y) => y.key === editing.key) : undefined;
  const [searching, setSearching] = useState(editing.kind === 'add');
  const [added, setAdded] = useState<Place | null>(null);
  const [addDate, setAddDate] = useState(row.date ?? '');
  const country = countryName(row.countryId);

  const search = (onPick: (c: Place) => void) => (
    <PlaceSearch
      countryFilter={row.countryId}
      withCountries={false}
      placeholder={`Город: ${country}`}
      onCity={(p) => onPick(p.kind === 'catalog' ? catalogToCity(p.city) : { id: p.city.id, name: p.city.name, nameEn: p.city.nameEn, countryId: p.city.countryId, lat: p.city.lat, lon: p.city.lon, region: p.city.region, source: p.city.source })}
      onCustom={(name) => onPick({ id: store.newCustomCityId(), name, nameEn: '', countryId: row.countryId, lat: null, lon: null, region: '', source: 'custom' })}
    />
  );

  const dateField = (value: string | null, onChange: (d: string | null) => void, photoDate: string | null, onReset?: () => void) => (
    <div className="field">
      <span>Дата посещения</span>
      <div className="row">
        <input className="input grow" type="date" max={today} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} />
        {value && (
          <button type="button" className="btn ghost" onClick={() => onChange(null)}>
            Без даты
          </button>
        )}
      </div>
      {photoDate && value !== photoDate && onReset && (
        <button type="button" className="link-btn" style={{ justifySelf: 'start' }} onClick={onReset}>
          Вернуть дату с фото — {formatDate(photoDate)}
        </button>
      )}
    </div>
  );

  if (editing.kind === 'add') {
    return (
      <Sheet title={`Город — ${country}`} onClose={onClose} headExtra={<Flag id={row.countryId} />}
        footer={
          added ? (
            <button type="button" className="btn lime grow" onClick={() => { onAdd(added, addDate || null); onClose(); }}>
              Добавить {added.name}
            </button>
          ) : undefined
        }
      >
        {added && !searching ? (
          <div className="stack">
            <button type="button" className="list-row card-row" onClick={() => setSearching(true)}>
              <Icon name="pin" size={20} />
              <span className="grow t">{added.name}</span>
              <span className="link-btn">Другой</span>
            </button>
            {dateField(addDate || null, (d) => setAddDate(d ?? ''), null)}
          </div>
        ) : (
          search((c) => {
            setAdded(c);
            setSearching(false);
          })
        )}
      </Sheet>
    );
  }

  if (editing.kind === 'country' || !city) {
    return (
      <Sheet title={country} onClose={onClose} headExtra={<Flag id={row.countryId} />}
        footer={
          <>
            <button type="button" className="btn ghost" onClick={() => onToggle(row.key)}>
              {row.on ? 'Не отмечать' : 'Отмечать'}
            </button>
            <button type="button" className="btn lime grow" onClick={onClose}>
              Готово
            </button>
          </>
        }
      >
        {dateField(row.date, onCountryDate, row.photoDate, () => onResetDate(row.key))}
        <p className="faint small" style={{ margin: 0 }}>
          Это дата первого посещения страны. Даты городов меняются отдельно — нажмите на город в списке.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet title={city.city.name} onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              if (city.manual) onRemove(city.key);
              else onToggle(city.key);
              onClose();
            }}
          >
            {city.manual ? 'Убрать' : city.on ? 'Не отмечать' : 'Отмечать'}
          </button>
          <button type="button" className="btn lime grow" onClick={onClose}>
            Готово
          </button>
        </>
      }
    >
      {searching ? (
        search((c) => {
          onReplace(city, c);
          setSearching(false);
          // An added city changes its key when replaced: close instead of showing a stale editor.
          if (city.manual) onClose();
        })
      ) : (
        <div className="stack">
          <button type="button" className="list-row card-row" onClick={() => setSearching(true)}>
            <Icon name="pin" size={20} />
            <span className="grow">
              <span className="t block ellipsis">{city.city.name}</span>
              <span className="s block ellipsis">{city.replaced ? 'изменён вручную' : city.manual ? 'добавлен вручную' : `найден по ${countLabel(city.photos, 'фото', 'фото', 'фото')}`}</span>
            </span>
            <span className="link-btn">Другой город</span>
          </button>
          {dateField(city.date, (d) => onCityDate(city.key, d), city.photoDate, () => onResetDate(city.key))}
        </div>
      )}
    </Sheet>
  );
}
