import { markPlaceVisited, toggleFavorite, unmarkPlaceVisited } from '../../app/hobbyActions';
import { focusOnMap } from '../../app/router';
import { useToast } from '../../app/toast';
import { been, useWorld } from '../../app/world';
import { type HobbyKind, mapLink, type Place, placeSubtitle, placeTitle, type Resort, resortFacts, type Spot } from '../../domain/hobby';
import { hobbyKey } from '../../domain/model';
import { useCatalog } from '../../geo/hobbyCatalog';
import { countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Flag, Sheet } from '../../ui/kit';
import { useHobbyVisited } from './HobbyWorld';
import { ResortLive } from './ResortWatch';
import { Cameras } from './Cameras';

const host = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Page of a ski resort or a surf spot. Empty facts are not shown at all. */
export function PlaceSheet({ kind, id, onClose }: { kind: HobbyKind; id: string; onClose: () => void }) {
  const { settings, hobby } = useWorld();
  const toast = useToast();
  const cat = useCatalog(kind === 'resort' ? 'resorts' : 'spots');
  const index = cat.index as Map<string, Place>;
  const visited = useHobbyVisited(kind, index);
  const p = index.get(id);

  if (!p) {
    return (
      <Sheet title={cat.status === 'loading' ? 'Загрузка…' : 'Место не найдено'} onClose={onClose}>
        {cat.status !== 'loading' && <p className="muted">В каталоге нет такого {kind === 'resort' ? 'курорта' : 'спота'} — возможно, его убрали или переименовали.</p>}
      </Sheet>
    );
  }
  const on = visited.has(p.id);
  const ids = [p.id, ...('alt' in p ? p.alt : [])];
  const fav = kind === 'spot' && hobby.some((m) => ids.some((x) => m.key === hobbyKey('fav', 'spot', x)));
  const r = kind === 'resort' ? (p as Resort) : null;
  const s = kind === 'spot' ? (p as Spot) : null;
  const facts = r ? resortFacts(r) : [];
  const spotFacts = s
    ? [
        { label: 'волна', value: s.wave },
        { label: 'уровень', value: s.level },
        { label: 'сезон', value: s.season },
      ].filter((f): f is { label: string; value: string } => !!f.value)
    : [];
  const sub = placeSubtitle(p);
  const where = [countryName(p.countryId), s?.group, p.region].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);

  return (
    <Sheet
      title={placeTitle(p)}
      onClose={onClose}
      headExtra={<Flag id={p.countryId} size="lg" />}
      footer={
        <button
          type="button"
          className="btn glass-btn"
          onClick={() => {
            onClose();
            window.setTimeout(() => focusOnMap({ kind: kind, id: p.id, lat: p.lat, lon: p.lon }), 50);
          }}
        >
          <Icon name="planet" size={18} /> Показать на карте
        </button>
      }
    >
      {sub && <p className="muted" style={{ margin: '-6px 0 0' }}>{sub}</p>}
      <div className="row wrap">
        {on && (
          <span className="pill lime">
            <Icon name="check" size={14} weight={2.2} /> {been(settings.gender).short}
          </span>
        )}
        {where.map((w) => (
          <span key={w} className="pill">
            {w}
          </span>
        ))}
        {s?.area && <span className="pill outline">направление</span>}
      </div>

      {(facts.length > 0 || spotFacts.length > 0) && (
        <div className="hero-stats place-facts">
          {[...facts, ...spotFacts].map((f) => (
            <div key={f.label}>
              <b className="num">{f.value}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      )}

      <div className="row">
        {on ? (
          <button type="button" className="btn ghost grow" onClick={() => void unmarkPlaceVisited(toast, kind, p)}>
            Снять отметку
          </button>
        ) : (
          <button type="button" className="btn lime grow" onClick={() => void markPlaceVisited(toast, kind, p, { travelTracking: settings.travelTracking })}>
            <Icon name="check" size={18} /> {been(settings.gender).here}
          </button>
        )}
        {kind === 'spot' && (
          <button type="button" className={`btn glass-btn heart ${fav ? 'on' : ''}`} aria-pressed={fav} aria-label={fav ? 'Убрать из избранного' : 'В избранное'} onClick={() => void toggleFavorite('spot', p, !fav)}>
            <Icon name="heart" size={18} />
          </button>
        )}
      </div>

      {r && <ResortLive resort={r} visited={on} />}
      {r && <Cameras cams={r.cams} resortName={placeTitle(r)} />}

      <div className="list">
        {r?.website && (
          <a className="list-row" href={r.website} target="_blank" rel="noopener noreferrer">
            <Icon name="link" size={20} />
            <span className="grow">
              <span className="t block">Официальный сайт</span>
              <span className="s block ellipsis">{host(r.website)}</span>
            </span>
            <Icon name="external" size={18} className="faint" />
          </a>
        )}
        {r?.telegram && (
          <a className="list-row" href={`https://t.me/${r.telegram}`} target="_blank" rel="noopener noreferrer">
            <Icon name="news" size={20} />
            <span className="grow">
              <span className="t block">Telegram-канал</span>
              <span className="s block ellipsis">@{r.telegram}</span>
            </span>
            <Icon name="external" size={18} className="faint" />
          </a>
        )}
        {s?.website && (
          <a className="list-row" href={s.website} target="_blank" rel="noopener noreferrer">
            <Icon name="link" size={20} />
            <span className="grow">
              <span className="t block">Подробнее</span>
              <span className="s block ellipsis">{host(s.website)}</span>
            </span>
            <Icon name="external" size={18} className="faint" />
          </a>
        )}
        <a className="list-row" href={mapLink(p)} target="_blank" rel="noopener noreferrer">
          <Icon name="map" size={20} />
          <span className="grow">
            <span className="t block">Карта</span>
            <span className="s block">OpenStreetMap</span>
          </span>
          <Icon name="external" size={18} className="faint" />
        </a>
      </div>
      {s?.src && <p className="faint tiny" style={{ margin: 0 }}>Источник характеристик: {s.src}</p>}
    </Sheet>
  );
}
