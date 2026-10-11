import { useEffect, useRef, useState } from 'react';
import { go } from '../../app/router';
import { store, useWorld } from '../../app/world';
import { countLabel, formatRange, nights, type TripStatus } from '../../domain/dates';
import type { Trip } from '../../domain/model';
import { countryName } from '../../geo/reference';
import { useAttachmentUrl } from '../../ui/files';
import { Icon } from '../../ui/Icon';
import { Flag } from '../../ui/kit';
import { TripStatusPill, useRoute } from './common';
import { RouteMap } from './RouteMap';

const PEEK = 62;
const BEHIND = 3;

/**
 * Wallet-style stack: the chosen trip lies in front, the next ones peek out above it showing their country.
 * Tap a peeking card to bring it forward, or swipe the front card up/down to flip through the stack.
 */
export function TripCarousel({ trips, statusOf, totalOf }: { trips: Trip[]; statusOf: (t: Trip) => TripStatus; totalOf: (id: string) => string | null }) {
  const [active, setActive] = useState(0);
  const n = trips.length;
  useEffect(() => {
    if (active >= n) setActive(0);
  }, [n, active]);
  const behind = Math.min(BEHIND, n - 1);
  const drag = useRef<{ y: number; moved: boolean } | null>(null);
  // A swipe must not also count as a tap that opens the trip.
  const swallowClick = useRef(false);
  const step = (d: number) => setActive((a) => (a + d + n) % n);

  // position of each trip in the stack: 0 = front, 1..behind = peeking, -1 = hidden
  const slot = (i: number) => {
    const k = (i - active + n) % n;
    return k <= behind ? k : -1;
  };

  return (
    <div className="wallet" style={{ height: `calc(${behind * PEEK}px + var(--card-h))` }}>
      {trips.map((t, i) => {
        const k = slot(i);
        const style =
          k < 0
            ? { top: 0, transform: `scale(${1 - BEHIND * 0.05})`, opacity: 0, zIndex: 0, pointerEvents: 'none' as const }
            : { top: (behind - k) * PEEK, transform: `scale(${1 - k * 0.05})`, opacity: 1, zIndex: 10 - k };
        return (
          <WalletCard
            key={t.id}
            trip={t}
            status={statusOf(t)}
            total={totalOf(t.id)}
            front={k === 0}
            style={style}
            onOpen={() => {
              if (swallowClick.current) {
                swallowClick.current = false;
                return;
              }
              if (k === 0) go(`trips/${t.id}`);
              else setActive(i);
            }}
            onPointerDown={(e) => {
              if (k !== 0) return;
              drag.current = { y: e.clientY, moved: false };
              (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d && Math.abs(e.clientY - d.y) > 10) d.moved = true;
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              if (!d || !d.moved) return;
              swallowClick.current = true;
              window.setTimeout(() => (swallowClick.current = false), 400);
              if (n > 1 && Math.abs(e.clientY - d.y) > 40) step(e.clientY < d.y ? 1 : -1);
            }}
          />
        );
      })}
    </div>
  );
}

function WalletCard({
  trip,
  status,
  total,
  front,
  style,
  onOpen,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  trip: Trip;
  status: TripStatus;
  total: string | null;
  front: boolean;
  style: React.CSSProperties;
  onOpen: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
}) {
  const route = useRoute(trip.id);
  const { world } = useWorld();
  const cover = useAttachmentUrl(trip.coverId);
  const points = route
    .filter((r) => r.city && r.city.lat !== null && r.city.lon !== null)
    .map((r) => ({ id: r.stop.cityId, lon: r.city?.lon as number, lat: r.city?.lat as number, visited: world.visitedCityIds.has(r.stop.cityId) }));
  const n = nights(trip.startDate, trip.endDate);
  const days = n === null ? null : n + 1;
  const first = trip.countryIds[0];
  const title = first ? (trip.countryIds.length > 1 ? `${countryName(first)} +${trip.countryIds.length - 1}` : countryName(first)) : trip.title;
  return (
    <div
      className={`wcard ${front ? 'front' : ''}`}
      style={style}
      role="button"
      tabIndex={0}
      aria-label={front ? `Открыть поездку ${trip.title}` : `Показать поездку ${trip.title}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
    >
      <div className="wcard-visual">{cover ? <img src={cover} alt="" draggable={false} /> : <RouteMap points={points} width={420} height={560} />}</div>
      <div className="wcard-top">
        <span className="glass-pill">
          {first && <Flag id={first} size="sm" />}
          <span className="ellipsis">{title}</span>
        </span>
        <button
          type="button"
          className={`heart ${trip.favorite ? 'on' : ''}`}
          aria-pressed={!!trip.favorite}
          aria-label={trip.favorite ? 'Убрать из избранного' : 'В избранное'}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            void store.saveTrip({ ...trip, favorite: !trip.favorite });
          }}
        >
          <Icon name="heart" size={22} weight={2} />
        </button>
      </div>
      <div className="wcard-info">
        <div className="row between">
          <h3 className="wcard-title ellipsis">{trip.title}</h3>
          <TripStatusPill status={status} />
        </div>
        <div className="ccard-meta">
          <span>
            <Icon name="calendar" size={17} /> {days ? countLabel(days, 'день', 'дня', 'дней') : 'без дат'}
          </span>
          <span>
            <Icon name="route" size={17} /> {countLabel(route.length, 'город', 'города', 'городов')}
          </span>
          {total && (
            <span>
              <Icon name="wallet" size={17} /> {total}
            </span>
          )}
        </div>
        {trip.startDate && <span className="ccard-dates num">{formatRange(trip.startDate, trip.endDate)}</span>}
      </div>
    </div>
  );
}
