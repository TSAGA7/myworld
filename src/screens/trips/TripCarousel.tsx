import { useEffect, useRef, useState } from 'react';
import { go } from '../../app/router';
import { useWorld } from '../../app/world';
import { countLabel, formatRange, nights, type TripStatus } from '../../domain/dates';
import type { Trip } from '../../domain/model';
import { countryName } from '../../geo/reference';
import { useAttachmentUrl } from '../../ui/files';
import { Icon } from '../../ui/Icon';
import { Flag } from '../../ui/kit';
import { TripStatusPill, useRoute } from './common';
import { RouteMap } from './RouteMap';

/** Swipeable cards: the centred card is full size, its neighbours peek out smaller and dimmer. */
export function TripCarousel({ trips, statusOf, totalOf }: { trips: Trip[]; statusOf: (t: Trip) => TripStatus; totalOf: (id: string) => string | null }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0;
      let bestD = Infinity;
      [...el.children].forEach((c, i) => {
        const card = c as HTMLElement;
        const center = card.offsetLeft + card.offsetWidth / 2;
        const d = Math.abs(center - mid);
        const k = Math.min(1, d / card.offsetWidth);
        card.style.setProperty('--k', k.toFixed(3));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      setIndex(best);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [trips.length]);

  const scrollTo = (i: number) => {
    const el = track.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: 'smooth' });
  };

  return (
    <div className="carousel">
      <div className="carousel-track" ref={track}>
        {trips.map((t) => (
          <CarouselCard key={t.id} trip={t} status={statusOf(t)} total={totalOf(t.id)} />
        ))}
      </div>
      {trips.length > 1 && (
        <div className="carousel-dots" role="tablist" aria-label="Поездки">
          {trips.map((t, i) => (
            <button key={t.id} type="button" role="tab" aria-selected={i === index} aria-label={t.title} onClick={() => scrollTo(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CarouselCard({ trip, status, total }: { trip: Trip; status: TripStatus; total: string | null }) {
  const route = useRoute(trip.id);
  const { world } = useWorld();
  const cover = useAttachmentUrl(trip.coverId);
  const points = route
    .filter((r) => r.city && r.city.lat !== null && r.city.lon !== null)
    .map((r) => ({ id: r.stop.cityId, lon: r.city?.lon as number, lat: r.city?.lat as number, visited: world.visitedCityIds.has(r.stop.cityId) }));
  const n = nights(trip.startDate, trip.endDate);
  const days = n === null ? null : n + 1;
  const first = trip.countryIds[0];
  return (
    <button type="button" className="ccard" onClick={() => go(`trips/${trip.id}`)}>
      <div className="ccard-visual">{cover ? <img src={cover} alt="" /> : <RouteMap points={points} width={420} height={560} />}</div>
      <div className="ccard-top">
        {first ? (
          <span className="glass-pill">
            <Flag id={first} size="sm" />
            {trip.countryIds.length > 1 ? `${countryName(first)} +${trip.countryIds.length - 1}` : countryName(first)}
          </span>
        ) : (
          <span />
        )}
        <TripStatusPill status={status} />
      </div>
      <div className="ccard-info">
        <h3 className="ccard-title">{trip.title}</h3>
        <div className="ccard-meta">
          <span>
            <Icon name="calendar" size={17} /> {days ? countLabel(days, 'день', 'дня', 'дней') : formatRange(trip.startDate, trip.endDate)}
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
    </button>
  );
}
