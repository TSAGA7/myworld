import { useLiveQuery } from 'dexie-react-hooks';
import { go } from '../../app/router';
import { db } from '../../app/world';
import { formatDate, formatRange } from '../../domain/dates';
import { Icon } from '../../ui/Icon';

/** Card for a hotel or booking flag on the map. */
export function PoiCard({ id, kind, onClose }: { id: string; kind: 'stay' | 'booking'; onClose: () => void }) {
  const rec = useLiveQuery(async () => {
    if (kind === 'stay') {
      const s = await db.stays.get(id);
      return s && { title: s.name, sub: s.address, when: formatRange(s.checkIn, s.checkOut), tripId: s.tripId, lat: s.lat, lon: s.lon };
    }
    const b = await db.bookings.get(id);
    return b && { title: b.title, sub: b.place, when: b.date ? `${formatDate(b.date)}${b.time ? `, ${b.time}` : ''}` : '', tripId: b.tripId, lat: b.lat, lon: b.lon };
  }, [id, kind]);
  const trip = useLiveQuery(() => (rec ? db.trips.get(rec.tripId) : undefined), [rec?.tripId]);
  if (!rec) return null;
  return (
    <article className="place-card glass" aria-label={rec.title}>
      <header className="row">
        <span className="carrier-logo" aria-hidden="true">
          <Icon name={kind === 'stay' ? 'bed' : 'ticket'} size={20} />
        </span>
        <div className="grow">
          <h2 className="h2 ellipsis">{rec.title}</h2>
          <div className="muted small ellipsis">{rec.sub}</div>
        </div>
        <button type="button" className="circle-btn sm" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={18} />
        </button>
      </header>
      {rec.when && <span className="pill">{rec.when}</span>}
      <div className="row card-actions">
        {trip && (
          <button type="button" className="btn lime grow" onClick={() => go(`trips/${trip.id}`)}>
            <Icon name="suitcase" size={18} /> {trip.title}
          </button>
        )}
        {rec.lat !== null && (
          <a className="btn glass-btn" href={`https://www.google.com/maps/search/?api=1&query=${rec.lat},${rec.lon}`} target="_blank" rel="noopener noreferrer" aria-label="Открыть в Google Картах">
            <Icon name="external" size={18} />
          </a>
        )}
      </div>
    </article>
  );
}
