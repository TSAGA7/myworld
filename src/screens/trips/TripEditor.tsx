import { useMemo, useState } from 'react';
import { go, goBack } from '../../app/router';
import { useToast } from '../../app/toast';
import { store, useWorld } from '../../app/world';
import type { CityInput } from '../../data/store';
import { nights } from '../../domain/dates';
import { catalogToCity } from '../../geo/catalog';
import { COUNTRIES, countryName, searchCountries } from '../../geo/reference';
import { prepareFile } from '../../ui/files';
import { Icon } from '../../ui/Icon';
import { Confirm, Field, Flag, Sheet } from '../../ui/kit';
import { PlaceSearch } from '../../ui/PlaceSearch';
import { useRoute } from './common';

interface Draft {
  key: string;
  id?: string;
  city: CityInput;
  startDate: string | null;
  endDate: string | null;
  note: string;
}

let seq = 0;
const nextKey = () => `d${++seq}`;

/** Create or edit a trip: name, dates, countries and the ordered list of cities with their dates. */
export function TripEditor({ tripId }: { tripId: string | null }) {
  const { trips } = useWorld();
  const toast = useToast();
  const existing = tripId ? trips.find((t) => t.id === tripId) : undefined;
  const route = useRoute(tripId);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [startDate, setStart] = useState(existing?.startDate ?? '');
  const [endDate, setEnd] = useState(existing?.endDate ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [countryIds, setCountryIds] = useState<string[]>(existing?.countryIds ?? []);
  const [stops, setStops] = useState<Draft[]>(() =>
    route
      .filter((r) => r.city)
      .map((r) => ({ key: nextKey(), id: r.stop.id, city: r.city as CityInput, startDate: r.stop.startDate, endDate: r.stop.endDate, note: r.stop.note })),
  );
  const [cover, setCover] = useState<File | null>(null);
  const [sheet, setSheet] = useState<'country' | 'city' | null>(null);
  const [cityCountry, setCityCountry] = useState<string | null>(null);
  const [customName, setCustomName] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const addCountry = (id: string) => setCountryIds((l) => (l.includes(id) ? l : [...l, id]));
  const addCity = (city: CityInput) => {
    addCountry(city.countryId);
    setStops((l) => [...l, { key: nextKey(), city, startDate: null, endDate: null, note: '' }]);
    toast(`${city.name} добавлен в маршрут`);
  };
  const move = (i: number, d: -1 | 1) =>
    setStops((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const copy = [...l];
      [copy[i], copy[j]] = [copy[j] as Draft, copy[i] as Draft];
      return copy;
    });
  const patch = (i: number, p: Partial<Draft>) => setStops((l) => l.map((s, k) => (k === i ? { ...s, ...p } : s)));
  const removeCountry = (id: string) => {
    if (stops.some((s) => s.city.countryId === id)) {
      toast(`Сначала уберите города страны ${countryName(id)} из маршрута`);
      return;
    }
    setCountryIds((l) => l.filter((x) => x !== id));
  };

  const datesWrong = !!startDate && !!endDate && endDate < startDate;
  const canSave = title.trim().length > 0 && !datesWrong && !busy;

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const trip = await store.saveTrip({
        id: existing?.id,
        title: title.trim(),
        startDate: startDate || null,
        endDate: endDate || null,
        countryIds,
        note,
        coverId: existing?.coverId ?? null,
      });
      await store.saveRoute(
        trip.id,
        stops.map((s) => ({ id: s.id, city: s.city, startDate: s.startDate, endDate: s.endDate, note: s.note })),
      );
      if (cover) await store.addAttachment(trip.id, 'cover', trip.id, await prepareFile(cover));
      toast(existing ? 'Изменения сохранены' : 'Поездка создана');
      go(`trips/${trip.id}`, true);
    } catch (e) {
      toast(`Не удалось сохранить: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen editor-screen">
      <div className="screen-inner">
        <header className="row">
          <button type="button" className="circle-btn" onClick={() => goBack(existing ? `trips/${existing.id}` : 'trips')} aria-label="Назад">
            <Icon name="back" size={20} />
          </button>
          <h1 className="h3 grow center-title">{existing ? 'Редактирование' : 'Новое путешествие'}</h1>
          <span style={{ width: 48 }} />
        </header>

        <h2 className="h1">
          <span className="thin">{existing ? 'Изменить' : 'Собрать'}</span>
          <br />
          поездку
        </h2>

        <div className="card stack">
          <Field label="Название">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, Италия и Швейцария" maxLength={80} />
          </Field>
          <div className="grid-2">
            <Field label="Начало">
              <input className="input" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label="Окончание">
              <input className="input" type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
          {datesWrong && <div className="banner warn">Окончание раньше начала — проверьте даты.</div>}
          {startDate && endDate && !datesWrong && <span className="faint small">{nights(startDate, endDate)} ночей в поездке</span>}
        </div>

        <section className="stack">
          <div className="section-title">
            <h3 className="h2">Страны</h3>
            <button type="button" className="link-btn" onClick={() => setSheet('country')}>
              + Добавить
            </button>
          </div>
          {countryIds.length === 0 ? (
            <p className="faint small" style={{ margin: 0 }}>Страны добавятся сами вместе с городами. Можно добавить и страну без городов.</p>
          ) : (
            <div className="chips wrap-chips">
              {countryIds.map((id) => (
                <span key={id} className="chip country-chip">
                  <Flag id={id} size="sm" />
                  {countryName(id)}
                  <button type="button" className="icon-plain" aria-label={`Убрать ${countryName(id)}`} onClick={() => removeCountry(id)}>
                    <Icon name="close" size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="stack">
          <div className="section-title">
            <h3 className="h2">Маршрут</h3>
            <button type="button" className="link-btn" onClick={() => setSheet('city')}>
              + Город
            </button>
          </div>
          {stops.length === 0 ? (
            <button type="button" className="card empty-route" onClick={() => setSheet('city')}>
              <Icon name="pin" size={22} />
              <span>Добавьте первый город — поиск работает и без интернета</span>
            </button>
          ) : (
            <ol className="route-edit">
              {stops.map((s, i) => (
                <li key={s.key} className="card tight stop-edit">
                  <div className="row">
                    <span className="stop-num num">{i + 1}</span>
                    <div className="grow">
                      <div className="strong ellipsis">{s.city.name}</div>
                      <div className="faint small row">
                        <Flag id={s.city.countryId} size="sm" /> {countryName(s.city.countryId)}
                        {s.city.lat === null && <span className="pill outline">нет координат</span>}
                      </div>
                    </div>
                    <button type="button" className="icon-plain" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Выше">
                      <Icon name="up" size={18} />
                    </button>
                    <button type="button" className="icon-plain" disabled={i === stops.length - 1} onClick={() => move(i, 1)} aria-label="Ниже">
                      <Icon name="down" size={18} />
                    </button>
                    <button type="button" className="icon-plain" onClick={() => setStops((l) => l.filter((_, k) => k !== i))} aria-label={`Убрать ${s.city.name}`}>
                      <Icon name="trash" size={18} />
                    </button>
                  </div>
                  <div className="grid-2">
                    <label className="field">
                      <span>Приезд</span>
                      <input
                        className="input"
                        type="date"
                        value={s.startDate ?? ''}
                        min={startDate || undefined}
                        max={endDate || undefined}
                        onChange={(e) => patch(i, { startDate: e.target.value || null })}
                      />
                    </label>
                    <label className="field">
                      <span>Отъезд</span>
                      <input
                        className="input"
                        type="date"
                        value={s.endDate ?? ''}
                        min={s.startDate || startDate || undefined}
                        max={endDate || undefined}
                        onChange={(e) => patch(i, { endDate: e.target.value || null })}
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="card stack">
          <Field label="Комментарий">
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Идеи, договорённости, что важно не забыть" />
          </Field>
          <Field label="Обложка" hint={existing?.coverId && !cover ? 'Обложка уже есть — новая заменит её' : 'Необязательно'}>
            <input className="input" type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
          </Field>
        </div>

        <div className="save-bar">
          <button type="button" className="btn lime block" disabled={!canSave} onClick={() => void save()}>
            {busy ? 'Сохраняю…' : existing ? 'Сохранить изменения' : 'Создать поездку'}
          </button>
          {!title.trim() && <span className="faint small center">Укажите название поездки</span>}
        </div>

        {existing && (
          <button type="button" className="btn danger block" onClick={() => setDel(true)}>
            <Icon name="trash" size={18} /> Удалить поездку
          </button>
        )}
      </div>

      {sheet === 'country' && (
        <CountryPicker
          selected={countryIds}
          onPick={(id) => {
            addCountry(id);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'city' && (
        <Sheet title="Добавить город" onClose={() => setSheet(null)}>
          {countryIds.length > 0 && (
            <div className="chips" role="group" aria-label="Искать в стране">
              <button type="button" className="chip" aria-pressed={cityCountry === null} onClick={() => setCityCountry(null)}>
                Все страны
              </button>
              {countryIds.map((id) => (
                <button key={id} type="button" className="chip" aria-pressed={cityCountry === id} onClick={() => setCityCountry(id)}>
                  <Flag id={id} size="sm" /> {countryName(id)}
                </button>
              ))}
            </div>
          )}
          <PlaceSearch
            key={cityCountry ?? 'all'}
            withCountries={false}
            countryFilter={cityCountry}
            placeholder="Город"
            onCity={(p) => addCity(p.kind === 'catalog' ? catalogToCity(p.city) : p.city)}
            onCustom={(name) => {
              setSheet(null);
              setCustomName(name);
            }}
          />
          <p className="faint small" style={{ margin: 0 }}>Можно добавить несколько городов подряд. Порядок меняется стрелками.</p>
        </Sheet>
      )}
      {customName !== null && (
        <CustomCity
          name={customName}
          defaultCountry={cityCountry ?? countryIds[0] ?? ''}
          onClose={() => setCustomName(null)}
          onAdd={(c) => {
            addCity(c);
            setCustomName(null);
          }}
        />
      )}
      {del && existing && (
        <Confirm
          title="Удалить поездку?"
          text="Удалятся маршрут, билеты, жильё, брони, заметки, файлы и чек-лист этой поездки. Отметки «посещён» на карте останутся."
          confirmLabel="Удалить"
          danger
          onConfirm={async () => {
            await store.deleteTrip(existing.id);
            toast('Поездка удалена');
            go('trips', true);
          }}
          onClose={() => setDel(false)}
        />
      )}
    </div>
  );
}

function CountryPicker({ selected, onPick, onClose }: { selected: string[]; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const list = q.trim() ? searchCountries(q, 12) : COUNTRIES.filter((c) => c.m195).sort((a, b) => a.ru.localeCompare(b.ru, 'ru'));
  return (
    <Sheet title="Добавить страну" onClose={onClose}>
      <label className="search">
        <Icon name="search" size={20} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Страна" aria-label="Страна" />
      </label>
      <div className="list">
        {list.map((c) => (
          <button key={c.id} type="button" className="list-row" onClick={() => onPick(c.id)} disabled={selected.includes(c.id)}>
            <Flag id={c.id} />
            <span className="grow t">{c.ru}</span>
            {selected.includes(c.id) && <Icon name="check" size={18} />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** A city that is not in the catalog. Coordinates stay empty until the user places it on the map. */
function CustomCity({ name, defaultCountry, onAdd, onClose }: { name: string; defaultCountry: string; onAdd: (c: CityInput) => void; onClose: () => void }) {
  const [n, setN] = useState(name);
  const [country, setCountry] = useState(defaultCountry);
  const sorted = useMemo(() => [...COUNTRIES].sort((a, b) => a.ru.localeCompare(b.ru, 'ru')), []);
  return (
    <Sheet
      title="Город вручную"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn dark"
          disabled={!n.trim() || !country}
          onClick={() => onAdd({ id: store.newCustomCityId(), name: n.trim(), nameEn: '', countryId: country, lat: null, lon: null, region: '', source: 'custom' })}
        >
          Добавить в маршрут
        </button>
      }
    >
      <p className="muted small" style={{ margin: 0 }}>
        Такого города нет в справочнике. Он сохранится без координат и не появится на карте, пока вы не укажете точку: на странице поездки нажмите
        «Указать на карте».
      </p>
      <Field label="Название">
        <input className="input" value={n} onChange={(e) => setN(e.target.value)} />
      </Field>
      <Field label="Страна">
        <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Выберите страну</option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ru}
            </option>
          ))}
        </select>
      </Field>
    </Sheet>
  );
}
