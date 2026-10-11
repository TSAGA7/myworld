import { useEffect, useRef } from 'react';
import { go } from '../../app/router';
import { store, useWorld } from '../../app/world';
import { countLabel, formatRange, nights, type TripStatus } from '../../domain/dates';
import type { Trip } from '../../domain/model';
import { wheelStep } from '../../domain/wheel';
import { countryName } from '../../geo/reference';
import { useAttachmentUrl } from '../../ui/files';
import { Icon } from '../../ui/Icon';
import { Flag } from '../../ui/kit';
import { TripStatusPill, useRoute } from './common';
import { RouteMap } from './RouteMap';

const PEEK = 62; // px of each card visible above the front one
const BEHIND = 3; // cards peeking out
const DRAG_PX = 120; // finger travel that turns the wheel by one card

/**
 * Trips on a wheel: the front card lies on top, the next ones peek out above. Drag the stack up or down —
 * it follows the finger; flick it and it keeps turning by inertia, slows down and settles on a card.
 * Tap the front card to open the trip, tap a peeking one to turn the wheel to it.
 */
export function TripCarousel({ trips, statusOf, totalOf }: { trips: Trip[]; statusOf: (t: Trip) => TripStatus; totalOf: (id: string) => string | null }) {
  const n = trips.length;
  const behind = Math.min(BEHIND, n - 1);
  const cards = useRef<Array<HTMLDivElement | null>>([]);
  const box = useRef<HTMLDivElement>(null);
  // While the wheel turns, glass blur inside the cards is switched off: re-blurring every frame is the costliest part.
  const moving = (on: boolean) => box.current?.classList.toggle('moving', on);
  const state = useRef({ pos: 0, vel: 0, target: null as number | null, raf: 0, last: 0 });
  const drag = useRef<{ y: number; pos: number; t: number; samples: Array<{ t: number; y: number }> } | null>(null);

  const layout = () => {
    const pos = state.current.pos;
    cards.current.forEach((el, i) => {
      if (!el || i >= n) return;
      let d = (((i - pos) % n) + n) % n; // 0..n
      if (n > 1 && d > n - 1) d -= n; // -1..n-1: the front card leaving downwards has negative d
      let top: number;
      let scale: number;
      let opacity = 1;
      let z: number;
      let tilt = 0;
      if (d < 0) {
        // leaving the front: slides down, tilts away and fades — then comes back at the far end of the wheel
        top = behind * PEEK - d * 90;
        scale = 1 + d * 0.04;
        opacity = 1 + d;
        tilt = d * 28;
        z = 200;
      } else if (d <= behind) {
        top = (behind - d) * PEEK;
        scale = 1 - d * 0.05;
        z = 100 - Math.round(d * 10);
      } else if (d < behind + 1) {
        top = (behind - d) * PEEK;
        scale = 1 - d * 0.05;
        opacity = behind + 1 - d;
        z = 10;
      } else {
        top = -PEEK;
        scale = 0.8;
        opacity = 0;
        z = 0;
      }
      el.style.transform = `translate3d(0, ${top}px, 0) perspective(900px) rotateX(${tilt}deg) scale(${scale})`;
      el.style.opacity = String(opacity);
      el.style.zIndex = String(z);
      // dimming with an overlay's opacity (composited) instead of a CSS filter (repainted every frame)
      el.style.setProperty('--dim', d > 0 ? String(Math.min(d, behind) * 0.07) : '0');
      el.classList.toggle('front', Math.abs(d) < 0.5);
      el.style.pointerEvents = opacity < 0.3 ? 'none' : '';
    });
  };

  const step = (dt: number) => wheelStep(state.current, dt, n);

  const animate = (now: number) => {
    const s = state.current;
    // real elapsed time (a slow phone skips frames but the wheel keeps its speed), integrated in small steps
    let dt = Math.min(0.25, (now - (s.last || now)) / 1000);
    s.last = now;
    if (!drag.current) {
      while (dt > 0) {
        const h = Math.min(dt, 1 / 120);
        dt -= h;
        if (step(h)) {
          s.raf = 0;
          layout();
          moving(false);
          return;
        }
      }
    }
    layout();
    s.raf = requestAnimationFrame(animate);
  };
  const kick = () => {
    const s = state.current;
    moving(true);
    if (!s.raf) {
      s.last = 0;
      s.raf = requestAnimationFrame(animate);
    }
  };

  useEffect(() => {
    const s = state.current;
    if (s.pos >= n) s.pos = 0;
    layout();
  });
  useEffect(() => {
    const s = state.current;
    return () => cancelAnimationFrame(s.raf);
  }, []);

  const indexAt = (el: EventTarget | null) => {
    const card = (el as HTMLElement | null)?.closest<HTMLElement>('[data-i]');
    return card ? Number(card.dataset.i) : -1;
  };

  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.heart')) return;
    const s = state.current;
    s.target = null;
    s.vel = 0;
    moving(true);
    // event time, not handler time: on a busy phone handlers run late, the finger's timing is what matters
    drag.current = { y: e.clientY, pos: s.pos, t: e.timeStamp, samples: [{ t: e.timeStamp, y: e.clientY }] };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || n < 2) return;
    state.current.pos = d.pos - (e.clientY - d.y) / DRAG_PX;
    d.samples.push({ t: e.timeStamp, y: e.clientY });
    if (d.samples.length > 6) d.samples.shift();
    layout();
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const s = state.current;
    if (Math.abs(e.clientY - d.y) < 8 && e.timeStamp - d.t < 500) {
      // a tap: open the front card or turn the wheel to the tapped one
      const i = indexAt(document.elementFromPoint(e.clientX, e.clientY));
      if (i < 0) return moving(false);
      const front = ((Math.round(s.pos) % n) + n) % n;
      if (i === front) {
        const trip = trips[i];
        moving(false);
        if (trip) go(`trips/${trip.id}`);
        return;
      }
      const ahead = (((i - s.pos) % n) + n) % n;
      s.target = s.pos + (ahead > n / 2 ? ahead - n : ahead);
      kick();
      return;
    }
    d.samples.push({ t: e.timeStamp, y: e.clientY });
    const b = d.samples[d.samples.length - 1] as { t: number; y: number };
    const a = d.samples.find((p) => b.t - p.t <= 100) ?? b;
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    s.vel = Math.max(-25, Math.min(25, -((b.y - a.y) / DRAG_PX) / dt));
    kick();
  };

  if (n === 0) return null;
  return (
    <div
      ref={box}
      className="wallet"
      style={{ height: `calc(${behind * PEEK}px + var(--card-h))` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="listbox"
      aria-label="Поездки: листайте вверх и вниз"
    >
      {trips.map((t, i) => (
        <WalletCard
          key={t.id}
          index={i}
          refCb={(el) => (cards.current[i] = el)}
          trip={t}
          status={statusOf(t)}
          total={totalOf(t.id)}
          onKey={() => go(`trips/${t.id}`)}
        />
      ))}
    </div>
  );
}

function WalletCard({
  trip,
  status,
  total,
  index,
  refCb,
  onKey,
}: {
  trip: Trip;
  status: TripStatus;
  total: string | null;
  index: number;
  refCb: (el: HTMLDivElement | null) => void;
  onKey: () => void;
}) {
  const route = useRoute(trip.id);
  const { world } = useWorld();
  const cover = useAttachmentUrl(trip.coverId);
  const points = route
    .filter((r) => r.city && r.city.lat !== null && r.city.lon !== null)
    .map((r) => ({ id: r.stop.cityId, lon: r.city?.lon as number, lat: r.city?.lat as number, visited: world.visitedCityIds.has(r.stop.cityId) }));
  const nn = nights(trip.startDate, trip.endDate);
  const days = nn === null ? null : nn + 1;
  const first = trip.countryIds[0];
  const title = first ? (trip.countryIds.length > 1 ? `${countryName(first)} +${trip.countryIds.length - 1}` : countryName(first)) : trip.title;
  return (
    <div ref={refCb} data-i={index} className="wcard" role="option" aria-selected={false} tabIndex={0} aria-label={trip.title} onKeyDown={(e) => e.key === 'Enter' && onKey()}>
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
          onPointerUp={(e) => e.stopPropagation()}
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
