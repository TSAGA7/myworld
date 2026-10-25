import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { go } from '../../app/router';
import { useToast } from '../../app/toast';
import { store, useWorld } from '../../app/world';
import { countLabel, formatRange, nights } from '../../domain/dates';
import type { Trip } from '../../domain/model';
import { cardPose, dragPos, DRAG_PX, fitWallet, wheelOffset, wheelStep } from '../../domain/wheel';
import { countryName } from '../../geo/reference';
import { useAttachmentUrl } from '../../ui/files';
import { Icon } from '../../ui/Icon';
import { Confirm, Flag } from '../../ui/kit';
import { TripStatusPill, useRoute } from './common';
import { RouteMap } from './RouteMap';

const BAR_GAP = 12; // air between the front card and the bottom soft bar
const ACTIONS_W = 150; // how far the front card slides left to reveal «edit» and «delete»
const DECIDE_PX = 8; // finger travel before we know whether it is a horizontal or a vertical gesture

/**
 * Trips on a wheel: the front card lies on top, the next ones peek out above. Drag the stack up or down —
 * it follows the finger; flick it and it keeps turning by inertia, slows down and settles on a card.
 * Tap the front card to open the trip, tap a peeking one to turn the wheel to it.
 */
export function TripCarousel({ trips, totalOf }: { trips: Trip[]; totalOf: (id: string) => string | null }) {
  const n = trips.length;
  // The stack is sized to end above the soft bar, so the front card's info is never under it.
  const [fit, setFit] = useState(() => fitWallet(560, n));
  const geo = useRef(fit);
  geo.current = fit;
  const { behind, peek: PEEK } = fit;
  const cards = useRef<Array<HTMLDivElement | null>>([]);
  const box = useRef<HTMLDivElement>(null);
  // While the wheel turns, glass blur inside the cards is switched off: re-blurring every frame is the costliest part.
  const moving = (on: boolean) => box.current?.classList.toggle('moving', on);
  const state = useRef({ pos: 0, vel: 0, target: null as number | null, raf: 0, last: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    pos: number;
    t: number;
    samples: Array<{ t: number; y: number }>;
    mode: 'tap' | 'v' | 'h';
    onFront: boolean;
    sx0: number;
  } | null>(null);
  // the front card slid left to show its actions: which card and by how much (≤ 0)
  const swipe = useRef({ i: -1, x: 0, raf: 0 });
  const actions = useRef<HTMLDivElement>(null);
  const [actionTrip, setActionTrip] = useState<string | null>(null);
  const [del, setDel] = useState<Trip | null>(null);
  const toast = useToast();

  const layout = () => {
    const pos = state.current.pos;
    const { behind: b, peek } = geo.current;
    cards.current.forEach((el, i) => {
      if (!el || i >= n) return;
      const d = wheelOffset(i, pos, n);
      const { top, scale, opacity, tilt, z } = cardPose(d, n, b, peek);
      const sx = i === swipe.current.i ? swipe.current.x : 0;
      el.style.transform = `translate3d(${sx}px, ${top}px, 0) perspective(900px) rotateX(${tilt}deg) scale(${scale})`;
      el.style.opacity = String(opacity);
      el.style.zIndex = String(z);
      // dimming with an overlay's opacity (composited) instead of a CSS filter (repainted every frame)
      el.style.setProperty('--dim', d > 0 ? String(Math.min(d, b) * 0.07) : '0');
      el.classList.toggle('front', Math.abs(d) < 0.5);
      el.style.pointerEvents = opacity < 0.3 ? 'none' : '';
    });
    const a = actions.current;
    if (a) {
      const open = Math.min(1, -swipe.current.x / ACTIONS_W);
      a.style.top = `${b * peek}px`;
      a.style.opacity = String(open);
      a.style.transform = `translate3d(${(1 - open) * 24}px, 0, 0)`;
      a.style.pointerEvents = open > 0.9 ? '' : 'none';
    }
  };

  /** Slides the front card to `to` (0 = closed, -ACTIONS_W = actions shown). */
  const slideTo = (to: number) => {
    const sw = swipe.current;
    cancelAnimationFrame(sw.raf);
    const tick = () => {
      sw.x += (to - sw.x) * 0.28;
      if (Math.abs(to - sw.x) < 0.5) {
        sw.x = to;
        if (to === 0) {
          sw.i = -1;
          setActionTrip(null);
        }
        layout();
        moving(false);
        return;
      }
      layout();
      sw.raf = requestAnimationFrame(tick);
    };
    moving(true);
    sw.raf = requestAnimationFrame(tick);
  };
  const closeSwipe = () => {
    if (swipe.current.i >= 0) slideTo(0);
  };

  // measure the free height between the top of the stack and the soft bar
  useLayoutEffect(() => {
    const measure = () => {
      const el = box.current;
      if (!el) return;
      const scroller = el.closest('.screen');
      const sRect = scroller?.getBoundingClientRect();
      const viewTop = sRect?.top ?? 0;
      const topInContent = el.getBoundingClientRect().top - viewTop + (scroller?.scrollTop ?? 0);
      const bar = document.querySelector('.softbar');
      const barTop = bar ? bar.getBoundingClientRect().top - viewTop : (scroller?.clientHeight ?? window.innerHeight);
      const next = fitWallet(barTop - topInContent - BAR_GAP, n);
      setFit((f) => (f.behind === next.behind && f.cardH === next.cardH && f.peek === next.peek ? f : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    const scroller = box.current?.closest('.screen');
    if (scroller) ro.observe(scroller);
    if (scroller?.firstElementChild) ro.observe(scroller.firstElementChild);
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [n]);

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
    const sw = swipe.current;
    return () => {
      cancelAnimationFrame(s.raf);
      cancelAnimationFrame(sw.raf);
    };
  }, []);

  const indexAt = (el: EventTarget | null) => {
    const card = (el as HTMLElement | null)?.closest<HTMLElement>('[data-i]');
    return card ? Number(card.dataset.i) : -1;
  };

  const frontIndex = () => ((Math.round(state.current.pos) % n) + n) % n;

  const onDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('.heart') || t.closest('.wcard-actions')) return;
    const s = state.current;
    s.target = null;
    s.vel = 0;
    cancelAnimationFrame(swipe.current.raf);
    const onFront = indexAt(t) === frontIndex() && !s.raf;
    // event time, not handler time: on a busy phone handlers run late, the finger's timing is what matters
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      pos: s.pos,
      t: e.timeStamp,
      samples: [{ t: e.timeStamp, y: e.clientY }],
      mode: 'tap',
      onFront,
      sx0: swipe.current.i === frontIndex() ? swipe.current.x : 0,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.mode === 'tap') {
      if (Math.hypot(dx, dy) < DECIDE_PX) return;
      d.mode = d.onFront && Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      moving(true); // blur off only once something actually moves — a plain tap keeps the glass
      if (d.mode === 'h') {
        const i = frontIndex();
        swipe.current.i = i;
        setActionTrip(trips[i]?.id ?? null);
      } else closeSwipe();
    }
    if (d.mode === 'h') {
      // follows the finger to the left; past the buttons it resists like a rubber band
      const raw = Math.min(0, d.sx0 + dx);
      swipe.current.x = raw < -ACTIONS_W ? -ACTIONS_W + (raw + ACTIONS_W) * 0.3 : raw;
      layout();
      return;
    }
    if (n < 2) return;
    state.current.pos = dragPos(d.pos, dy);
    d.samples.push({ t: e.timeStamp, y: e.clientY });
    if (d.samples.length > 6) d.samples.shift();
    layout();
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const s = state.current;
    if (d.mode === 'h') {
      const flick = (e.clientX - d.x) / Math.max(16, e.timeStamp - d.t); // px per ms
      slideTo(swipe.current.x < -ACTIONS_W / 2 || flick < -0.6 ? -ACTIONS_W : 0);
      return;
    }
    if (d.mode === 'tap') {
      if (e.type === 'pointercancel') return;
      // a tap with actions open just closes them
      if (swipe.current.i >= 0) return closeSwipe();
      // a tap: open the front card or turn the wheel to the tapped one
      const i = indexAt(document.elementFromPoint(e.clientX, e.clientY));
      if (i < 0) return;
      if (i === frontIndex()) {
        const trip = trips[i];
        if (trip) go(`trips/${trip.id}`);
        return;
      }
      const ahead = (((i - s.pos) % n) + n) % n;
      s.target = s.pos + (ahead > n / 2 ? ahead - n : ahead);
      kick();
      return;
    }
    if (n < 2) return moving(false);
    d.samples.push({ t: e.timeStamp, y: e.clientY });
    const b = d.samples[d.samples.length - 1] as { t: number; y: number };
    const a = d.samples.find((p) => b.t - p.t <= 100) ?? b;
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    s.vel = Math.max(-25, Math.min(25, (b.y - a.y) / DRAG_PX / dt));
    kick();
  };

  const shown = trips.find((t) => t.id === actionTrip);

  if (n === 0) return null;
  return (
    <>
    <div
      ref={box}
      className="wallet"
      style={{ height: behind * PEEK + fit.cardH, ['--card-h' as string]: `${fit.cardH}px` }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      role="listbox"
      aria-label="Поездки: листайте вверх и вниз, карточку влево — изменить или удалить"
    >
      <div ref={actions} className="wcard-actions" style={{ height: fit.cardH, opacity: 0, pointerEvents: 'none' }}>
        <button
          type="button"
          className="wact"
          aria-label="Редактировать поездку"
          onClick={() => {
            if (!shown) return;
            closeSwipe();
            go(`trips/${shown.id}/edit`);
          }}
        >
          <Icon name="edit" size={24} weight={2} />
        </button>
        <button type="button" className="wact danger" aria-label="Удалить поездку" onClick={() => shown && setDel(shown)}>
          <Icon name="trash" size={24} weight={2} />
        </button>
      </div>
      {trips.map((t, i) => (
        <WalletCard
          key={t.id}
          index={i}
          refCb={(el) => (cards.current[i] = el)}
          trip={t}
          total={totalOf(t.id)}
          onKey={() => go(`trips/${t.id}`)}
        />
      ))}
    </div>
      {del && (
        <Confirm
          title="Удалить поездку?"
          text="Удалятся маршрут, билеты, жильё, брони, заметки, файлы и чек-лист этой поездки. Отметки «посещён» на карте останутся."
          confirmLabel="Удалить"
          danger
          onConfirm={async () => {
            swipe.current = { i: -1, x: 0, raf: 0 };
            setActionTrip(null);
            await store.deleteTrip(del.id);
            setDel(null);
            toast('Поездка удалена');
          }}
          onClose={() => {
            setDel(null);
            closeSwipe();
          }}
        />
      )}
    </>
  );
}

function WalletCard({
  trip,
  total,
  index,
  refCb,
  onKey,
}: {
  trip: Trip;
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
          <TripStatusPill trip={trip} />
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
