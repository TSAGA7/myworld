import { useMemo, useRef, useState } from 'react';
import { useToast } from '../../app/toast';
import { store, useToday, useWorld } from '../../app/world';
import { countLabel, formatDate, formatRange, plural } from '../../domain/dates';
import { type FoundCountry, type FoundTrip, findTrips, overlaps, type ResolvedPoint, summarize, tripTitle } from '../../domain/photoPlaces';
import { catalogToCity } from '../../geo/catalog';
import { loadPhotoResolver, type PhotoResolver, readPhoto } from '../../geo/photoGeo';
import { countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Check, Flag, Sheet } from '../../ui/kit';

type Step =
  | { kind: 'pick' }
  | { kind: 'reading'; done: number; total: number }
  | { kind: 'result'; total: number; located: number; resolver: PhotoResolver; countries: FoundCountry[]; trips: FoundTrip[] };

const PARALLEL = 6;
const CITY_PREVIEW = 10;

/** «Отметить по фото»: the user picks photos, the app reads where and when they were taken — on the device, offline. */
export function PhotoImport({ onClose }: { onClose: () => void }) {
  const { world, settings, cities, trips } = useWorld();
  const today = useToday();
  const toast = useToast();
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [off, setOff] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const run = useRef(0);
  // Photos can be added in several rounds; everything found so far is kept.
  const acc = useRef<{ points: ResolvedPoint[]; total: number; located: number; seen: Set<string> }>({ points: [], total: 0, located: 0, seen: new Set() });

  const homeCountryId = settings.homeCountryId ?? (settings.homeCityId ? (cities.get(settings.homeCityId)?.countryId ?? null) : null);

  const pick = async (list: FileList | null) => {
    // The same photo picked twice is counted once.
    const fileKey = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;
    const files = [...(list ?? [])].filter((f) => !acc.current.seen.has(fileKey(f)));
    if (!files.length) {
      if (list?.length) toast('Эти фото уже учтены');
      return;
    }
    const id = ++run.current;
    setStep({ kind: 'reading', done: 0, total: files.length });
    try {
      const resolverP = loadPhotoResolver();
      const points: ResolvedPoint[] = [];
      let located = 0;
      const prev = acc.current;
      let done = 0;
      let next = 0;
      const resolver = await resolverP;
      const worker = async () => {
        while (next < files.length) {
          const f = files[next++];
          if (!f) break;
          const p = await readPhoto(f, today);
          if (p) {
            located++;
            const r = resolver.resolve(p);
            if (r) points.push(r);
          }
          done++;
          if (run.current === id && (done % 20 === 0 || done === files.length)) setStep({ kind: 'reading', done, total: files.length });
        }
      };
      await Promise.all(Array.from({ length: Math.min(PARALLEL, files.length) }, worker));
      if (run.current !== id) return;
      const all = { points: [...prev.points, ...points], total: prev.total + files.length, located: prev.located + located, seen: new Set([...prev.seen, ...files.map(fileKey)]) };
      acc.current = all;
      const found = homeCountryId
        ? findTrips(all.points, homeCountryId).filter((t) => !trips.some((x) => overlaps(t, x.startDate, x.endDate)))
        : [];
      setOff(new Set());
      setStep({ kind: 'result', total: all.total, located: all.located, resolver, countries: summarize(all.points), trips: found });
    } catch (e) {
      if (run.current !== id) return;
      toast(`Не удалось прочитать фото: ${e instanceof Error ? e.message : e}`);
      setStep({ kind: 'pick' });
    }
  };

  const toggle = (key: string, children: string[] = []) =>
    setOff((s) => {
      const n = new Set(s);
      if (n.has(key)) {
        n.delete(key);
        for (const c of children) n.delete(c);
      } else {
        n.add(key);
        for (const c of children) n.add(c);
      }
      return n;
    });

  const result = step.kind === 'result' ? step : null;
  const counts = useMemo(() => {
    if (!result) return { countries: 0, cities: 0, trips: 0, fresh: 0 };
    let countriesOn = 0;
    let citiesOn = 0;
    let fresh = 0;
    for (const c of result.countries) {
      if (off.has(`c:${c.countryId}`)) continue;
      countriesOn++;
      if (!world.visitedCountryIds.has(c.countryId)) fresh++;
      citiesOn += c.cities.filter((x) => !off.has(`y:${x.cityId}`)).length;
    }
    return { countries: countriesOn, cities: citiesOn, trips: result.trips.filter((_, i) => !off.has(`t:${i}`)).length, fresh };
  }, [result, off, world.visitedCountryIds]);

  const save = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const places: Parameters<typeof store.importPhotoPlaces>[0]['places'][number][] = [];
      for (const c of result.countries) {
        if (off.has(`c:${c.countryId}`)) continue;
        places.push({ city: null, countryId: c.countryId, date: c.first });
        for (const y of c.cities) {
          const cat = result.resolver.city(y.cityId);
          if (cat && !off.has(`y:${y.cityId}`)) places.push({ city: catalogToCity(cat), countryId: c.countryId, date: y.first });
        }
      }
      const tripsIn = result.trips
        .filter((_, i) => !off.has(`t:${i}`))
        .map((t) => ({
          title: tripTitle(t, countryName),
          start: t.start,
          end: t.end,
          countryIds: t.countryIds,
          stops: t.stops.flatMap((s) => {
            const cat = result.resolver.city(s.cityId);
            return cat ? [{ city: catalogToCity(cat), startDate: s.start, endDate: s.end }] : [];
          }),
        }));
      const r = await store.importPhotoPlaces({ places, trips: tripsIn });
      const parts = [
        r.countries ? `новых стран: ${r.countries}` : null,
        r.cities ? `новых городов: ${r.cities}` : null,
        r.trips ? `поездок: ${r.trips}` : null,
      ].filter(Boolean);
      toast(parts.length ? `Отмечено по фото — ${parts.join(', ')}` : 'Всё найденное уже было отмечено, даты уточнены');
      onClose();
    } catch (e) {
      toast(`Не удалось сохранить: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const picker = (label: string, cls: string) => (
    <label className={`btn ${cls}`}>
      <Icon name="image" size={18} /> {label}
      <input
        type="file"
        accept="image/*"
        multiple
        className="sr"
        onChange={(e) => {
          void pick(e.target.files);
          e.target.value = '';
        }}
      />
    </label>
  );

  if (!result) {
    return (
      <Sheet title="Отметить по фото" onClose={onClose} footer={step.kind === 'pick' ? picker('Выбрать фото', 'lime grow') : undefined}>
        {step.kind === 'reading' ? (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>
              Читаем место и дату съёмки: <b className="num">{step.done}</b> из <b className="num">{step.total}</b>
            </p>
            <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={step.total} aria-valuenow={step.done}>
              <i style={{ width: `${Math.max(2, (step.done / step.total) * 100)}%` }} />
            </div>
            <p className="faint small" style={{ margin: 0 }}>
              Фото никуда не отправляются: всё считается на этом телефоне, сами снимки не сохраняются.
            </p>
          </div>
        ) : (
          <div className="stack">
            <p className="muted" style={{ margin: 0 }}>
              Выберите фото из путешествий — можно сразу много: в окне выбора проведите пальцем по снимкам. Приложение найдёт по геометкам страны и города,
              а по датам — поездки. Вы увидите список и решите, что отметить.
            </p>
            <p className="faint small" style={{ margin: 0 }}>
              Фото не загружаются в интернет и не сохраняются — читаются только место и дата съёмки.
            </p>
          </div>
        )}
      </Sheet>
    );
  }

  const nothing = result.countries.length === 0;
  return (
    <Sheet
      title="Найдено по фото"
      onClose={onClose}
      footer={
        nothing ? (
          picker('Выбрать другие фото', 'lime grow')
        ) : (
          <>
            {picker('Добавить фото', 'ghost')}
            <button type="button" className="btn lime grow" disabled={busy || counts.countries + counts.trips === 0} onClick={() => void save()}>
              Отметить
            </button>
          </>
        )
      }
    >
      <div className="sync-summary three">
        <div>
          <b className="num">{result.countries.length}</b>
          <span>{plural(result.countries.length, 'страна', 'страны', 'стран')}</span>
        </div>
        <div>
          <b className="num">{result.countries.reduce((n, c) => n + c.cities.length, 0)}</b>
          <span>{plural(result.countries.reduce((n, c) => n + c.cities.length, 0), 'город', 'города', 'городов')}</span>
        </div>
        <div>
          <b className="num">{result.trips.length}</b>
          <span>{plural(result.trips.length, 'поездка', 'поездки', 'поездок')}</span>
        </div>
      </div>
      <p className="faint small" style={{ margin: 0 }}>
        С геометкой {result.located} из {countLabel(result.total, 'фото', 'фото', 'фото')}.
      </p>

      {result.located === 0 && (
        <div className="card stack tight">
          <b>В выбранных фото нет геопозиции</b>
          <p className="muted small" style={{ margin: 0 }}>
            Так бывает со скриншотами и сохранёнными картинками. На iPhone Safari может убирать место съёмки при выборе из «Фото»: в окне выбора нажмите
            «Параметры» и включите геопозицию, если такой пункт есть. Другой путь — сохранить снимки в «Файлы» и выбрать их оттуда.
          </p>
        </div>
      )}

      {result.trips.length > 0 && (
        <section className="stack tight">
          <h3 className="h3">Поездки</h3>
          <div className="list">
            {result.trips.map((t, i) => (
              <button key={`${t.start}-${i}`} type="button" className="list-row" onClick={() => toggle(`t:${i}`)}>
                <Check on={!off.has(`t:${i}`)} />
                <span className="grow">
                  <span className="t block ellipsis">{tripTitle(t, countryName)}</span>
                  <span className="s block ellipsis">
                    {formatRange(t.start, t.end)} · {t.stops.length ? countLabel(t.stops.length, 'город', 'города', 'городов') : 'без городов'}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <p className="faint small" style={{ margin: 0 }}>Создадутся поездки с маршрутом и датами. Поездки, которые совпадают по датам с вашими, не предлагаются.</p>
        </section>
      )}
      {!homeCountryId && !nothing && (
        <p className="faint small" style={{ margin: 0 }}>
          Чтобы находить поездки, укажите домашний город в профиле — тогда снимки за границей сложатся в поездки по датам.
        </p>
      )}

      {!nothing && (
        <section className="stack tight">
          <h3 className="h3">Страны и города</h3>
          <div className="list">
            {result.countries.map((c) => {
              const ck = `c:${c.countryId}`;
              const on = !off.has(ck);
              const already = world.visitedCountryIds.has(c.countryId);
              const expanded = open.has(c.countryId);
              const shown = expanded ? c.cities : c.cities.slice(0, CITY_PREVIEW);
              return (
                <div key={c.countryId} className="photo-country">
                  <button type="button" className="list-row" onClick={() => toggle(ck, c.cities.map((x) => `y:${x.cityId}`))}>
                    <Check on={on} />
                    <Flag id={c.countryId} />
                    <span className="grow">
                      <span className="t block ellipsis">{countryName(c.countryId)}</span>
                      <span className="s block ellipsis">
                        {[already ? 'уже отмечена' : 'новая', c.first ? `с ${formatDate(c.first)}` : null, countLabel(c.photos, 'фото', 'фото', 'фото')]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                  </button>
                  {on && c.cities.length > 0 && (
                    <div className="photo-cities">
                      {shown.map((y) => {
                        const yk = `y:${y.cityId}`;
                        const name = result.resolver.city(y.cityId)?.ru ?? y.cityId;
                        return (
                          <button key={y.cityId} type="button" className="chip" aria-pressed={!off.has(yk)} onClick={() => toggle(yk)}>
                            {!off.has(yk) && <Icon name="check" size={14} />} <span className="ellipsis">{name}</span>
                            {world.visitedCityIds.has(y.cityId) && <span className="count">✓</span>}
                          </button>
                        );
                      })}
                      {c.cities.length > CITY_PREVIEW && (
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setOpen((s) => new Set(expanded ? [...s].filter((x) => x !== c.countryId) : [...s, c.countryId]))}
                        >
                          {expanded ? 'Свернуть' : `ещё ${c.cities.length - CITY_PREVIEW}`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="faint small" style={{ margin: 0 }}>
            Выбрано: {countLabel(counts.countries, 'страна', 'страны', 'стран')}
            {counts.fresh ? ` (новых ${counts.fresh})` : ''}, {countLabel(counts.cities, 'город', 'города', 'городов')}. У уже отмеченных мест дата
            посещения станет раньше, если фото старше.
          </p>
        </section>
      )}
    </Sheet>
  );
}
