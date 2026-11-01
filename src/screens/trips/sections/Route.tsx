import { focusOnMap, go } from '../../../app/router';
import { useWorld } from '../../../app/world';
import { countLabel, formatRange, nights } from '../../../domain/dates';
import { type Trip } from '../../../domain/model';
import { countryName } from '../../../geo/reference';
import { Icon } from '../../../ui/Icon';
import { Empty, Flag } from '../../../ui/kit';
import { type RouteStop } from '../common';

export function RouteSection({ trip, route }: { trip: Trip; route: RouteStop[] }) {
  const { world } = useWorld();
  if (route.length === 0) {
    return (
      <Empty
        icon="route"
        title="Маршрут пуст"
        text="Добавьте города в порядке посещения и даты остановок."
        action={
          <button type="button" className="btn dark" onClick={() => go(`trips/${trip.id}/edit`)}>
            Составить маршрут
          </button>
        }
      />
    );
  }
  return (
    <ol className="route-list">
      {route.map(({ stop, city }, i) => {
        const status = world.cityStatus.get(stop.cityId) ?? 'none';
        const n = nights(stop.startDate, stop.endDate);
        const hasCoords = !!city && city.lat !== null;
        return (
          <li key={stop.id} className="route-stop">
            <span className={`stop-num num ${status}`}>{i + 1}</span>
            <div className="card tight grow">
              <div className="row">
                <div className="grow">
                  <div className="strong ellipsis">{city?.name ?? 'Город удалён'}</div>
                  <div className="faint small row">
                    <Flag id={stop.countryId} size="sm" />
                    {countryName(stop.countryId)}
                  </div>
                </div>
                {hasCoords ? (
                  <button type="button" className="circle-btn sm" aria-label={`Показать ${city?.name} на карте`} onClick={() => focusOnMap({ kind: 'city', id: stop.cityId })}>
                    <Icon name="planet" size={18} />
                  </button>
                ) : (
                  <button type="button" className="btn sm ghost" onClick={() => focusOnMap({ kind: 'relocate', id: stop.cityId })}>
                    <Icon name="pin" size={16} /> Указать на карте
                  </button>
                )}
              </div>
              <div className="row wrap small muted stop-meta">
                {stop.startDate || stop.endDate ? <span>{formatRange(stop.startDate, stop.endDate)}</span> : <span className="faint">даты не указаны</span>}
                {n !== null && n > 0 && <span>{countLabel(n, 'ночь', 'ночи', 'ночей')}</span>}
                {status === 'visited' && <span className="pill lime">посещён</span>}
                {status === 'planned' && <span className="pill dark">на карте</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
