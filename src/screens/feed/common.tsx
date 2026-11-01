import { useEffect, useState } from 'react';
import type { FeedState } from '../../feed/client';
import { ago } from '../../feed/format';
import { Icon } from '../../ui/Icon';

/** A clock that refreshes "N мин назад" labels every minute. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/** "Обновлено 5 мин назад · каждый час", or the offline note with a retry. */
export function StatusLine({ state, updatedAt, every }: { state: FeedState<unknown>; updatedAt: string | undefined; every: string }) {
  const now = useNow();
  return (
    <div className="feed-status faint small">
      {state.status === 'loading' ? (
        <span className="spinner sm" aria-label="Обновляем" />
      ) : state.status === 'offline' ? (
        <Icon name="cloud" size={15} />
      ) : (
        <Icon name="check" size={15} />
      )}
      <span className="grow">
        {state.status === 'offline' ? 'Нет связи — показана сохранённая копия' : updatedAt ? `Обновлено ${ago(updatedAt, now)} · ${every}` : every}
      </span>
      {state.status === 'offline' && (
        <button type="button" className="link-btn" onClick={state.reload}>
          Повторить
        </button>
      )}
    </div>
  );
}

export const Loading = () => (
  <div className="empty">
    <span className="spinner" />
  </div>
);

/** Moscow time "11:19" of an ISO moment. */
export const mskTime = (iso: string): string => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });

/** Chips with links to the original posts. */
export function SourceLinks({ links }: { links: ReadonlyArray<{ name: string; url: string }> }) {
  return (
    <div className="src-links">
      {links.map((l) => (
        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="src-link">
          {l.name}
          <Icon name="external" size={12} />
        </a>
      ))}
    </div>
  );
}
