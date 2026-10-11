import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type MapFocus, onFocusRequest, takeFocus } from '../../app/router';
import { useToast } from '../../app/toast';
import { db, store, useToday, useWorld } from '../../app/world';
import type { CityInput } from '../../data/store';
import { countLabel, formatDate, plural } from '../../domain/dates';
import { lastJourney, worldProgress } from '../../domain/world';
import { catalogToCity } from '../../geo/catalog';
import { countryAt } from '../../geo/geometry';
import { COUNTRIES, COUNTRY_BY_ID, countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Field, Segmented, Sheet } from '../../ui/kit';
import { PlaceSearch } from '../../ui/PlaceSearch';
import { FallbackMap } from './FallbackMap';
import type { MapApi, PlaceCollection, PoiCollection } from './MapView';
import { useLiveQuery } from 'dexie-react-hooks';
import { PoiCard } from './PoiCard';
import { CityCard, CountryCard } from './PlaceCard';

const MapView = lazy(() => import('./MapView').then((m) => ({ default: m.MapView })));

type View = 'map' | 'globe';
type Selection = { kind: 'city'; city: CityInput } | { kind: 'country'; id: string } | { kind: 'poi'; id: string; poiKind: 'stay' | 'booking' } | null;
type Picking = { name: string; relocateId: string | null } | null;

const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
})();

const readView = (): View => {
  try {
    return localStorage.getItem('myworld.view') === 'map' ? 'map' : 'globe';
  } catch {
    return 'globe';
  }
};

export function Planet({ active, onSettings }: { active: boolean; onSettings: () => void }) {
  const data = useWorld();
  const { world, cities, settings } = data;
  const today = useToday();
  const toast = useToast();
  const api = useRef<MapApi>(null);
  const [view, setView] = useState<View>(readView);
  const [selection, setSelection] = useState<Selection>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [picking, setPicking] = useState<Picking>(null);
  const [picked, setPicked] = useState<{ name: string; lon: number; lat: number; countryId: string | null; relocateId: string | null } | null>(null);
  const [detailOn, setDetailOn] = useState(false);
  const [failure, setFailure] = useState<string | null>(hasWebGL ? null : 'Браузер не поддерживает WebGL');
  const [statsOpen, setStatsOpen] = useState(() => {
    try {
      return localStorage.getItem('myworld.stats') !== 'closed';
    } catch {
      return true;
    }
  });

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem('myworld.view', v);
    } catch {
      /* not critical */
    }
  };
  const toggleStats = () => {
    setStatsOpen((o) => {
      try {
        localStorage.setItem('myworld.stats', o ? 'closed' : 'open');
      } catch {
        /* not critical */
      }
      return !o;
    });
  };

  const places: PlaceCollection = useMemo(() => {
    const features: PlaceCollection['features'] = [];
    for (const [id, status] of world.cityStatus) {
      const c = cities.get(id);
      if (!c || c.lat === null || c.lon === null || status === 'none') continue;
      features.push({ type: 'Feature', properties: { id, status, trips: world.cityTripCount.get(id) ?? 0 }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } });
    }
    return { type: 'FeatureCollection', features };
  }, [world, cities]);

  const poiRows = useLiveQuery(
    async () => ({ stays: await db.stays.filter((s) => s.lat !== null).toArray(), bookings: await db.bookings.filter((b) => b.lat !== null).toArray() }),
    [],
  );
  const pois: PoiCollection = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...(poiRows?.stays ?? []).map((s) => ({ type: 'Feature' as const, properties: { id: s.id, kind: 'stay' as const }, geometry: { type: 'Point' as const, coordinates: [s.lon as number, s.lat as number] } })),
        ...(poiRows?.bookings ?? []).map((b) => ({ type: 'Feature' as const, properties: { id: b.id, kind: 'booking' as const }, geometry: { type: 'Point' as const, coordinates: [b.lon as number, b.lat as number] } })),
      ],
    }),
    [poiRows],
  );

  const progress = worldProgress(COUNTRIES, world.visitedCountryIds, settings.methodology);
  const last = lastJourney(data.trips, data.visits, cities, today, countryName);

  const focusCity = useCallback(
    (city: CityInput) => {
      setSelection({ kind: 'city', city });
      if (city.lat !== null && city.lon !== null) api.current?.flyTo(city.lon, city.lat, Math.max(5, 5));
    },
    [],
  );
  const focusCountry = useCallback((id: string) => {
    setSelection({ kind: 'country', id });
    const c = COUNTRY_BY_ID.get(id);
    if (c) api.current?.fitBounds(c.bbox, 5.5);
  }, []);

  // Requests from other tabs ("Показать на карте")
  const handleFocus = useCallback(
    (f: MapFocus) => {
      if (f.kind === 'country') focusCountry(f.id);
      if (f.kind === 'city') {
        const c = cities.get(f.id);
        if (c) focusCity(c);
      }
      if (f.kind === 'relocate') {
        const c = cities.get(f.id);
        if (c) {
          setSelection(null);
          setPicking({ name: c.name, relocateId: c.id });
          const country = COUNTRY_BY_ID.get(c.countryId);
          if (country) api.current?.fitBounds(country.bbox, 6);
        }
      }
      if (f.kind === 'trip') {
        const pts = data.stops
          .filter((s) => s.tripId === f.id)
          .map((s) => cities.get(s.cityId))
          .filter((c): c is NonNullable<typeof c> => !!c && c.lat !== null && c.lon !== null);
        if (pts.length) {
          const lons = pts.map((p) => p.lon as number);
          const lats = pts.map((p) => p.lat as number);
          setSelection(null);
          api.current?.fitBounds([Math.min(...lons) - 1, Math.min(...lats) - 1, Math.max(...lons) + 1, Math.max(...lats) + 1], 7);
        }
      }
    },
    [cities, data.stops, focusCity, focusCountry],
  );
  useEffect(() => {
    if (!active || !data.ready) return;
    // Let the map finish its first layout before flying.
    const t = window.setTimeout(() => {
      const f = takeFocus();
      if (f) handleFocus(f);
    }, 350);
    return () => window.clearTimeout(t);
  }, [active, data.ready, handleFocus]);
  useEffect(
    () =>
      onFocusRequest(() => {
        window.setTimeout(() => {
          const f = takeFocus();
          if (f) handleFocus(f);
        }, 350);
      }),
    [handleFocus],
  );

  const onPick = async (lon: number, lat: number) => {
    if (!picking) return;
    const countryId = await countryAt(lon, lat);
    setPicked({ name: picking.name, lon, lat, countryId, relocateId: picking.relocateId });
    setPicking(null);
  };

  const fitAll = () => {
    const pts = places.features.map((f) => f.geometry.coordinates);
    if (pts.length === 0) {
      api.current?.flyTo(30, 35, 1.4);
      return;
    }
    const lons = pts.map((p) => p[0] as number);
    const lats = pts.map((p) => p[1] as number);
    api.current?.fitBounds([Math.min(...lons) - 2, Math.min(...lats) - 2, Math.max(...lons) + 2, Math.max(...lats) + 2], 6);
  };

  const mapProps = {
    globe: view === 'globe',
    countryStatus: world.countryStatus,
    places,
    selectedCity: selection?.kind === 'city' ? selection.city.id : null,
    selectedCountry: selection?.kind === 'country' ? selection.id : null,
    focusPoint:
      selection?.kind === 'city' && !world.cityStatus.has(selection.city.id) && selection.city.lon !== null && selection.city.lat !== null
        ? ([selection.city.lon, selection.city.lat] as [number, number])
        : null,
    picking: !!picking,
    onCity: (id: string) => {
      const c = cities.get(id);
      if (c) setSelection({ kind: 'city', city: c });
    },
    onCountry: (id: string) => setSelection({ kind: 'country', id }),
    onPick: (lon: number, lat: number) => void onPick(lon, lat),
    onBackground: () => setSelection(null),
    pois,
    onPoi: (id: string, kind: 'stay' | 'booking') => setSelection({ kind: 'poi', id, poiKind: kind }),
  };

  return (
    <div className="planet">
      {failure || settings.lite ? (
        <FallbackMap ref={api} {...mapProps} />
      ) : (
        <Suspense fallback={<div className="map-canvas map-loading"><span className="spinner" /></div>}>
          <MapView
            ref={api}
            {...mapProps}
            lite={settings.lite}
            detail={settings.detail}
            active={active}
            onFailure={(m) => {
              setFailure(m);
              toast('3D недоступен на этом устройстве — включён упрощённый режим карты');
            }}
            onDetail={(s) => setDetailOn(s === 'on')}
          />
        </Suspense>
      )}

      <div className="planet-top">
        <div className="row">
          <button type="button" className="search search-btn grow" onClick={() => setSearchOpen(true)}>
            <Icon name="search" size={20} />
            <span className="faint">Найти страну или город</span>
          </button>
          <button type="button" className="circle-btn" onClick={onSettings} aria-label="Настройки">
            <Icon name="settings" size={20} />
          </button>
        </div>
        <div className="row between">
          <Segmented
            label="Вид карты"
            value={view}
            onChange={changeView}
            options={[
              { value: 'map', label: 'Карта', icon: 'map' },
              { value: 'globe', label: '3D-глобус', icon: 'globe' },
            ]}
          />
          {!statsOpen && (
            <button type="button" className="stats-pill glass" onClick={toggleStats} aria-expanded={false} aria-label="Показать статистику">
              <b className="num">{progress.visited}</b>
              <span className="muted">{plural(progress.visited, 'страна', 'страны', 'стран')}</span>
              <Icon name="chevronDown" size={16} />
            </button>
          )}
        </div>
        {statsOpen && !picking && (
          <section className="stats-card glass" aria-label="Статистика">
            <div className="stat">
              <b className="num">{progress.visited}</b>
              <span>{countLabel(progress.visited, 'страна', 'страны', 'стран').replace(/^\d+ /, '')}</span>
            </div>
            <div className="stat">
              <b className="num">{world.visitedCityIds.size}</b>
              <span>{countLabel(world.visitedCityIds.size, 'город', 'города', 'городов').replace(/^\d+ /, '')}</span>
            </div>
            <div className="stat">
              <b className="num">{progress.percent}%</b>
              <span>мира</span>
            </div>
            <div className="stat last">
              <button type="button" className="stats-close icon-plain" onClick={toggleStats} aria-label="Свернуть статистику">
                <Icon name="chevronUp" size={18} />
              </button>
              <span className="faint tiny">Последнее путешествие</span>
              <span className="ellipsis strong small">{last ? last.title : 'пока нет'}</span>
              {last?.date && <span className="faint tiny">{formatDate(last.date)}</span>}
            </div>
          </section>
        )}
      </div>

      {detailOn && !failure && !settings.lite && (
        <div className="map-credit">
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>, <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>
        </div>
      )}

      <div className="map-tools">
        <button type="button" className="circle-btn" onClick={() => api.current?.zoomBy(1)} aria-label="Приблизить">
          <Icon name="plus" size={20} />
        </button>
        <button type="button" className="circle-btn" onClick={() => api.current?.zoomBy(-1)} aria-label="Отдалить">
          <Icon name="minus" size={20} />
        </button>
        <button type="button" className="circle-btn" onClick={fitAll} aria-label="Показать все мои места">
          <Icon name="target" size={20} />
        </button>
      </div>

      {picking && (
        <div className="pick-banner glass" role="status">
          <Icon name="hand" size={22} />
          <span className="grow">
            Коснитесь карты там, где находится <b>{picking.name}</b>. Приблизьте карту для точности.
          </span>
          <button type="button" className="btn sm ghost" onClick={() => setPicking(null)}>
            Отмена
          </button>
        </div>
      )}

      {!picking && selection && (
        <div className="card-dock">
          {selection.kind === 'city' ? (
            <CityCard key={selection.city.id} city={selection.city} onClose={() => setSelection(null)} />
          ) : selection.kind === 'poi' ? (
            <PoiCard key={selection.id} id={selection.id} kind={selection.poiKind} onClose={() => setSelection(null)} />
          ) : (
            <CountryCard key={selection.id} countryId={selection.id} onClose={() => setSelection(null)} />
          )}
        </div>
      )}

      {data.ready && !selection && !picking && world.cityStatus.size === 0 && world.visitedCountryIds.size === 0 && (
        <div className="card-dock">
          <div className="place-card glass onboarding">
            <p className="h3" style={{ margin: 0 }}>
              <span style={{ fontWeight: 300 }}>Отметьте, где вы были.</span> Нажмите на страну или найдите город.
            </p>
            <button type="button" className="btn lime" onClick={() => setSearchOpen(true)}>
              <Icon name="search" size={18} /> Найти город
            </button>
          </div>
        </div>
      )}

      {searchOpen && (
        <Sheet title="Поиск" onClose={() => setSearchOpen(false)}>
          <PlaceSearch
            onCountry={(c) => {
              setSearchOpen(false);
              focusCountry(c.id);
            }}
            onCity={(p) => {
              setSearchOpen(false);
              focusCity(p.kind === 'catalog' ? catalogToCity(p.city) : p.city);
            }}
            onCustom={(name) => {
              setSearchOpen(false);
              setSelection(null);
              setPicking({ name, relocateId: null });
            }}
          />
        </Sheet>
      )}

      {picked && (
        <CustomCitySheet
          picked={picked}
          onClose={() => setPicked(null)}
          onSaved={(city) => {
            setPicked(null);
            focusCity(city);
          }}
        />
      )}
    </div>
  );
}

function CustomCitySheet({
  picked,
  onClose,
  onSaved,
}: {
  picked: { name: string; lon: number; lat: number; countryId: string | null; relocateId: string | null };
  onClose: () => void;
  onSaved: (c: CityInput) => void;
}) {
  const toast = useToast();
  const { cities } = useWorld();
  const [name, setName] = useState(picked.name);
  const [countryId, setCountryId] = useState(picked.countryId ?? '');
  const [status, setStatus] = useState<'visited' | 'planned' | 'none'>(picked.relocateId ? 'none' : 'visited');
  const sorted = useMemo(() => [...COUNTRIES].sort((a, b) => a.ru.localeCompare(b.ru, 'ru')), []);
  const save = async () => {
    if (!name.trim() || !countryId) return;
    const lat = Math.round(picked.lat * 10000) / 10000;
    const lon = Math.round(picked.lon * 10000) / 10000;
    if (picked.relocateId) {
      await store.updateCity(picked.relocateId, { name: name.trim(), lat, lon });
      const c = cities.get(picked.relocateId);
      toast('Местоположение сохранено');
      if (c) onSaved({ ...c, name: name.trim(), lat, lon });
      return;
    }
    const city: CityInput = { id: store.newCustomCityId(), name: name.trim(), nameEn: '', countryId, lat, lon, region: '', source: 'custom' };
    if (status === 'none') await store.ensureCity(city);
    else await store.markCity(city, status);
    toast(`${city.name} добавлен на карту`);
    onSaved(city);
  };
  return (
    <Sheet
      title={picked.relocateId ? 'Уточнить место' : 'Новый город'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn dark" disabled={!name.trim() || !countryId} onClick={() => void save()}>
            Сохранить
          </button>
        </>
      }
    >
      <p className="muted small" style={{ margin: 0 }}>
        Точка: {picked.lat.toFixed(4)}, {picked.lon.toFixed(4)}
      </p>
      <Field label="Название">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Страна" hint={picked.countryId ? 'Определена по точке на карте' : 'Точка вне границ стран — выберите страну'}>
        <select className="select" value={countryId} onChange={(e) => setCountryId(e.target.value)}>
          <option value="">Выберите страну</option>
          {sorted.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ru}
            </option>
          ))}
        </select>
      </Field>
      {!picked.relocateId && (
        <Segmented
          label="Статус"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'visited', label: 'Посещён' },
            { value: 'planned', label: 'В планах' },
            { value: 'none', label: 'Без отметки' },
          ]}
        />
      )}
    </Sheet>
  );
}
