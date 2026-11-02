import { useEffect, useState } from 'react';
import { notePublished, usePullStatus, type FeedState } from '../../feed/client';
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

/** Moscow-independent local clock time «18:37». */
const hm = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/**
 * Only «нет связи» is shown above the list (the owner asked to drop the «обновлено …» line); the time the data was
 * collected is still registered for the pull-to-refresh banner.
 */
export function StatusLine({ state, updatedAt }: { state: FeedState<unknown>; updatedAt: string | undefined; every?: string }) {
  useEffect(() => notePublished(updatedAt), [updatedAt]);
  if (state.status !== 'offline') return null;
  return (
    <div className="feed-status faint small">
      <Icon name="cloud" size={15} />
      <span className="grow">Нет связи — показана сохранённая копия</span>
      <button type="button" className="link-btn" onClick={state.reload}>
        Повторить
      </button>
    </div>
  );
}

/** What the last pull-to-refresh did: under the tabs, so «потянул — ничего не изменилось» is never silent. */
export function PullBanner() {
  const pull = usePullStatus();
  const now = useNow();
  const [hidden, setHidden] = useState<string | null>(null);
  const key = `${pull.phase}:${pull.checkedAt}`;
  // A finished result stays 15 s, then hides; the «collecting» note stays while the run goes.
  useEffect(() => {
    if (pull.phase === 'collecting' || pull.phase === 'checking' || pull.phase === 'idle') return;
    const t = window.setTimeout(() => setHidden(key), 15_000);
    return () => window.clearTimeout(t);
  }, [key, pull.phase]);
  if (pull.phase === 'idle' || hidden === key) return null;
  const at = pull.publishedAt;
  const text =
    pull.phase === 'checking'
      ? 'Проверяем, есть ли свежее…'
      : pull.phase === 'collecting'
        ? 'Запустили новый сбор новостей и цен — обычно 1–3 минуты, лента обновится сама'
        : pull.phase === 'fresh'
          ? `Готово: свежие данные${at ? `, собраны в ${hm(at)}` : ''}`
          : pull.phase === 'offline'
            ? 'Нет связи — проверить не получилось'
            : `Свежее не появилось: это последняя версия${at ? `, собрана в ${hm(at)} (${ago(at, now)})` : ''}`;
  return (
    <div className={`pull-banner ${pull.phase}`} role="status">
      {pull.phase === 'checking' || pull.phase === 'collecting' ? <span className="spinner sm" /> : <Icon name={pull.phase === 'fresh' ? 'check' : 'info'} size={16} />}
      <span className="grow">
        {text}
        {pull.note && pull.phase !== 'collecting' && <span className="block faint">{pull.note}</span>}
      </span>
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

/** Photo of the original post; disappears quietly if the source no longer serves it. */
export function PostImage({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return <img className="post-img" src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}
