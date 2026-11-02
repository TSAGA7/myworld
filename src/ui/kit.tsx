import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COUNTRY_BY_ID, flagUrl } from '../geo/reference';
import { Icon, type IconName } from './Icon';

/** Bottom sheet on phones, centered dialog on wide screens. Rendered in a portal so page scroll never moves it. */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  headExtra,
  labelledBy,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headExtra?: ReactNode;
  labelledBy?: string;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const sheetRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  useSwipeDown(sheetRef, scrimRef, () => closeRef.current());
  return createPortal(
    <>
      <div ref={scrimRef} className="scrim" onClick={onClose} />
      <section ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : labelledBy}>
        <div className="grabber" />
        <header className="sheet-head">
          <h2 className="h2">{title}</h2>
          {headExtra}
          <button type="button" className="circle-btn sm" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </>,
    document.body,
  );
}

/**
 * Pull a bottom sheet down to close it: from the grabber/header anywhere, from the content only when it is scrolled to
 * the top. A sideways gesture (chips, swipeable tabs) is left alone; on wide screens the sheet is a dialog and stays.
 */
export function useSwipeDown(sheetRef: RefObject<HTMLElement>, scrimRef: RefObject<HTMLElement>, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || window.matchMedia('(min-width: 700px)').matches) return;
    let startY = 0;
    let startX = 0;
    let startT = 0;
    let dy = 0;
    let mode: 'idle' | 'maybe' | 'drag' | 'off' = 'idle';
    const body = () => el.querySelector<HTMLElement>('.sheet-body');
    const set = (y: number, animate: boolean) => {
      el.style.transition = animate ? 'transform 0.28s cubic-bezier(.2,.8,.2,1)' : 'none';
      el.style.transform = y ? `translateY(${y}px)` : '';
      if (scrimRef.current) {
        scrimRef.current.style.transition = animate ? 'opacity 0.28s' : 'none';
        scrimRef.current.style.opacity = y ? String(Math.max(0, 1 - y / (el.offsetHeight || 1))) : '';
      }
    };
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      const target = e.target as HTMLElement;
      if (!t || e.touches.length > 1 || target.closest('input, textarea, select, [contenteditable], .no-swipe-down')) {
        mode = 'off';
        return;
      }
      const inBody = !!target.closest('.sheet-body');
      const b = body();
      // In the content, only from the very top (otherwise this is an ordinary scroll).
      mode = inBody && b && b.scrollTop > 0 ? 'off' : 'maybe';
      startY = t.clientY;
      startX = t.clientX;
      startT = performance.now();
      dy = 0;
    };
    const move = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || mode === 'off' || mode === 'idle') return;
      const y = t.clientY - startY;
      const x = t.clientX - startX;
      if (mode === 'maybe') {
        if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
        if (y <= 0 || Math.abs(x) > Math.abs(y)) {
          mode = 'off';
          return;
        }
        mode = 'drag';
      }
      e.preventDefault();
      dy = Math.max(0, y);
      set(dy, false);
    };
    const end = () => {
      if (mode === 'drag') {
        const v = dy / Math.max(1, performance.now() - startT);
        if (dy > 110 || v > 0.6) {
          set(el.offsetHeight + 40, true);
          window.setTimeout(() => closeRef.current(), 220);
        } else set(0, true);
      }
      mode = 'idle';
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [sheetRef, scrimRef]);
}

export function Confirm({
  title,
  text,
  confirmLabel,
  danger,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  text?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'danger' : 'dark'}`}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {text && <p className="muted" style={{ margin: 0 }}>{text}</p>}
      {children}
    </Sheet>
  );
}

export function Flag({ id, size = '' }: { id: string; size?: '' | 'sm' | 'lg' }) {
  const url = flagUrl(id);
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <span className={`flag none ${size}`} aria-hidden="true">
        {(COUNTRY_BY_ID.get(id)?.iso2 ?? id).slice(0, 2)}
      </span>
    );
  }
  return <img className={`flag ${size}`} src={url} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />;
}

/** Pill switch with a sliding lime thumb. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; icon?: IconName; badge?: number | string }>;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, options.length]);
  return (
    <div ref={ref} className={`segmented glass ${className}`} role="group" aria-label={label}>
      {thumb && <span className="thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)`, left: 0 }} />}
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={17} />}
          {o.label}
          {o.badge !== undefined && <span className="seg-badge num">{o.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="faint" style={{ paddingLeft: 4 }}>{hint}</small>}
    </label>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="circle-btn lime" aria-hidden="true">
        <Icon name={icon} />
      </span>
      <h3 className="h3">{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Check({ on }: { on: boolean }) {
  return (
    <span className="check" data-on={on} aria-hidden="true">
      <Icon name="check" size={16} weight={2.6} />
    </span>
  );
}

/** Light/topographic backdrop used behind list screens. */
export const Topo = ({ fade = true }: { fade?: boolean }) => <div className={`topo ${fade ? 'fade' : ''}`} aria-hidden="true" />;
