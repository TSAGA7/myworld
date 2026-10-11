import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useToast } from '../../app/toast';
import { db, store, useWorld } from '../../app/world';
import { countLabel, formatDate } from '../../domain/dates';
import type { Trip } from '../../domain/model';
import { previewAddToMap, previewMarkVisited, type VisitPreviewItem } from '../../domain/tripToMap';
import { countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Check, Flag, Sheet } from '../../ui/kit';

function usePlaceName() {
  const { cities } = useWorld();
  return (cityId: string | null, countryId: string) => (cityId ? (cities.get(cityId)?.name ?? '?') : countryName(countryId));
}

/** "Добавить города на карту": preview of what changes, then one idempotent write. */
export function AddToMapSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const toast = useToast();
  const { cities } = useWorld();
  const name = usePlaceName();
  const [busy, setBusy] = useState(false);
  const preview = useLiveQuery(async () => {
    const [stops, plans, visits] = await Promise.all([db.stops.where('tripId').equals(trip.id).toArray(), db.plans.toArray(), db.visits.toArray()]);
    return previewAddToMap(trip, stops, plans, visits);
  }, [trip]);
  if (!preview) return null;
  const pending = preview.items.filter((i) => i.state !== 'visited' && !i.linked).length;

  const run = async () => {
    setBusy(true);
    try {
      const r = await store.addTripToMap(trip.id);
      toast(
        r.added > 0
          ? `На карту добавлено: ${r.added}${r.already ? `, уже было: ${r.already}` : ''}`
          : `Все ${countLabel(r.already, 'место', 'места', 'мест')} уже были на карте`,
      );
      onClose();
    } catch (e) {
      toast(`Не удалось: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Добавить на карту"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn lime" disabled={busy || pending === 0} onClick={() => void run()}>
            {pending === 0 ? 'Всё уже на карте' : preview.added > 0 ? `Добавить ${preview.added}` : 'Связать с поездкой'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        Новые места появятся на карте и глобусе как <b>запланированные</b>. Посещёнными они не станут, пока вы не отметите это отдельно.
      </p>
      <div className="sync-summary">
        <div>
          <b className="num">{preview.added}</b>
          <span>новых</span>
        </div>
        <div>
          <b className="num">{preview.already}</b>
          <span>уже на карте</span>
        </div>
      </div>
      <div className="list">
        {preview.items.map((i) => {
          const city = i.cityId ? cities.get(i.cityId) : undefined;
          const noCoords = !!city && city.lat === null;
          return (
            <div key={i.key} className="list-row">
              <Flag id={i.countryId} size="sm" />
              <span className="grow">
                <span className="t block">{name(i.cityId, i.countryId)}</span>
                <span className="s block">
                  {i.cityId ? countryName(i.countryId) : 'страна без городов в маршруте'}
                  {noCoords ? ', нет координат — на карте появится после уточнения' : ''}
                </span>
              </span>
              <span className={`pill ${i.state === 'new' ? 'lime' : i.state === 'visited' ? '' : 'dark'}`}>
                {i.state === 'new' ? 'новое' : i.state === 'visited' ? 'посещено' : i.linked ? 'уже добавлено' : 'в планах'}
              </span>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

/** "Отметить города посещёнными": the user picks places and decides about differing dates. */
export function MarkVisitedSheet({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const toast = useToast();
  const name = usePlaceName();
  const [items, setItems] = useState<VisitPreviewItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replace, setReplace] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [stops, visits] = await Promise.all([db.stops.where('tripId').equals(trip.id).toArray(), db.visits.toArray()]);
      const list = previewMarkVisited(trip, stops, visits);
      if (!alive) return;
      setItems(list);
      setSelected(new Set(list.filter((i) => !i.linked).map((i) => i.key)));
    })();
    return () => {
      alive = false;
    };
  }, [trip]);
  if (!items) return null;

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const allOn = items.every((i) => selected.has(i.key));
  const effective = items.filter((i) => selected.has(i.key) && !(i.linked && !(i.dateConflict && replace.has(i.key)))).length;

  const run = async () => {
    setBusy(true);
    try {
      const r = await store.markTripVisited(trip.id, selected, replace);
      const n = r.created + r.updated;
      toast(n ? `Отмечено посещёнными: ${r.created}${r.updated ? `, обновлено: ${r.updated}` : ''}` : 'Ничего не изменилось — всё уже было отмечено');
      onClose();
    } catch (e) {
      toast(`Не удалось: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Где вы побывали?"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button type="button" className="btn dark" disabled={busy || selected.size === 0} onClick={() => void run()}>
            <Icon name="check" size={18} /> Отметить {selected.size || ''}
          </button>
        </>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        Выберите места, где вы действительно были. Карта, глобус, счётчик стран и прогресс обновятся сразу.
      </p>
      <button type="button" className="link-btn" style={{ justifySelf: 'start' }} onClick={() => setSelected(allOn ? new Set() : new Set(items.map((i) => i.key)))}>
        {allOn ? 'Снять все' : 'Выбрать все'}
      </button>
      <div className="list">
        {items.map((i) => (
          <div key={i.key} className="visit-item">
            <button type="button" className="list-row" onClick={() => setSelected((s) => toggle(s, i.key))} aria-pressed={selected.has(i.key)}>
              <Check on={selected.has(i.key)} />
              <span className="grow">
                <span className="t block">{name(i.cityId, i.countryId)}</span>
                <span className="s block">
                  {i.existing
                    ? `Уже посещён${i.existing.date ? ` ${formatDate(i.existing.date)}` : ''}${i.linked ? ', отмечен этой поездкой' : ' — повторной записи не будет'}`
                    : i.proposedDate
                      ? `Дата посещения: ${formatDate(i.proposedDate)}`
                      : 'Без даты'}
                </span>
              </span>
              <Flag id={i.countryId} size="sm" />
            </button>
            {i.dateConflict && selected.has(i.key) && (
              <label className="conflict">
                <input type="checkbox" checked={replace.has(i.key)} onChange={() => setReplace((s) => toggle(s, i.key))} />
                <span>
                  Заменить дату {formatDate(i.existing?.date ?? null)} на {formatDate(i.proposedDate)}
                </span>
              </label>
            )}
          </div>
        ))}
      </div>
      {effective === 0 && selected.size > 0 && <p className="faint small" style={{ margin: 0 }}>Выбранные места уже отмечены этой поездкой — изменений не будет.</p>}
    </Sheet>
  );
}
