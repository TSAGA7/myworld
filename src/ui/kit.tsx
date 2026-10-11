import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : labelledBy}>
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
  options: ReadonlyArray<{ value: T; label: string; icon?: IconName }>;
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
