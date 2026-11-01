import { useEffect, useMemo, useRef, useState } from 'react';
import { useFeedFile } from '../../feed/client';
import { localize } from '../../feed/editorial';
import { ago, filterNews, type NewsFilter } from '../../feed/format';
import { TAG_LABEL, TAGS, type FeedSource, type NewsItem } from '../../feed/schema';
import { Icon } from '../../ui/Icon';
import { Empty } from '../../ui/kit';
import { Loading, PostImage, StatusLine, useNow } from './common';
import { feedPrefs, setSetting, useWorld } from '../../app/world';
import { useToast } from '../../app/toast';
import { type FeedHobby, hobbyOfSource, sourceVisible } from '../../feed/visibility';

/* ===================== Новости */

const PAGE = 25;

export function NewsView() {
  const state = useFeedFile('news');
  const now = useNow();
  const { settings } = useWorld();
  const toast = useToast();
  const prefs = feedPrefs(settings);
  const [filter, setFilter] = useState<NewsFilter | FeedHobby>('all');
  const [open, setOpen] = useState<string | null>(null);
  const translations = useFeedFile('translations');
  const items = useMemo(
    () => localize(state.data?.items ?? [], translations.data).filter((i) => sourceVisible(i.sourceId, prefs)),
    [state.data, translations.data, prefs.rider, prefs.surf, prefs.sportNews, prefs.hidden],
  );
  const hideSource = (id: string, name: string) => {
    const before = settings.hiddenSources;
    void setSetting('hiddenSources', [...before, id]);
    toast(`«${name}» скрыт из ленты`, { label: 'Вернуть', run: () => void setSetting('hiddenSources', before) });
  };
  const sources = useMemo(() => new Map((state.data?.sources ?? []).map((s) => [s.id, s])), [state.data]);
  const filtered = useMemo(() => (filter === 'rider' || filter === 'surf' ? items.filter((i) => hobbyOfSource(i.sourceId) === filter) : filterNews(items, filter)), [items, filter]);
  const hobbyCounts = useMemo(() => ({ rider: items.filter((i) => hobbyOfSource(i.sourceId) === 'rider').length, surf: items.filter((i) => hobbyOfSource(i.sourceId) === 'surf').length }), [items]);
  // A page of news at a time: hundreds of cards with photos at once is what made iPhones reload the page.
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [filter]);
  const shown = filtered.slice(0, limit);
  const more = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = more.current;
    if (!el || limit >= filtered.length) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setLimit((l) => l + PAGE), { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, filtered.length]);
  const counts = useMemo(() => Object.fromEntries(TAGS.map((t) => [t, items.filter((i) => i.tags.includes(t)).length])), [items]);

  if (!items.length) {
    if (state.status === 'loading') return <Loading />;
    return (
      <Empty
        icon="cloud"
        title={state.status === 'offline' ? 'Нет связи' : 'Новостей пока нет'}
        text={state.status === 'offline' ? 'Лента загрузится, когда появится интернет.' : 'Лента собирается каждый час из тревел-каналов и сайтов.'}
        action={
          <button type="button" className="btn dark" onClick={state.reload}>
            Обновить
          </button>
        }
      />
    );
  }

  return (
    <>
      <StatusLine state={state} updatedAt={state.data?.updatedAt} every="каждый час" />
      <div className="chips" role="group" aria-label="Тема">
        <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          Все <span className="count">{items.length}</span>
        </button>
        {(['rider', 'surf'] as const)
          .filter((h) => hobbyCounts[h] > 0)
          .map((h) => (
            <button key={h} type="button" className="chip" aria-pressed={filter === h} onClick={() => setFilter(h)}>
              {h === 'rider' ? 'Горы' : 'Сёрф'} <span className="count">{hobbyCounts[h]}</span>
            </button>
          ))}
        {TAGS.filter((t) => (counts[t] ?? 0) > 0).map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={filter === t} onClick={() => setFilter(t)}>
            {TAG_LABEL[t]} <span className="count">{counts[t]}</span>
          </button>
        ))}
      </div>
      <div className="news-list">
        {shown.map((n) => (
          <NewsCard key={n.id} item={n} source={sources.get(n.sourceId)} sources={sources} now={now} open={open === n.id} onToggle={() => setOpen(open === n.id ? null : n.id)} onHide={() => hideSource(n.sourceId, sources.get(n.sourceId)?.name ?? n.sourceId)} />
        ))}
      </div>
      {limit < filtered.length && <div ref={more} className="feed-more" aria-hidden="true"><span className="spinner sm" /></div>}
    </>
  );
}

function NewsCard({ item, source, sources, now, open, onToggle, onHide }: { item: NewsItem; source: FeedSource | undefined; sources: Map<string, FeedSource>; now: Date; open: boolean; onToggle: () => void; onHide: () => void }) {
  const isTg = item.url.startsWith('https://t.me/');
  return (
    <article className={`card tight news-card ${open ? 'open' : ''}`}>
      {item.image && <PostImage src={item.image} />}
      <button type="button" className="news-main" onClick={onToggle} aria-expanded={open}>
        <span className="news-meta faint small">
          <b className="news-src">{source?.name ?? item.sourceId}</b> · {ago(item.at, now)}
          {item.tags.includes('deal') && <span className="pill lime news-pill">Акция</span>}
          {item.lang === 'en' && <span className="pill news-pill">перевод</span>}
        </span>
        <b className="news-title">{item.title}</b>
        {item.text && <span className="news-text">{item.text}</span>}
      </button>
      <div className="news-foot">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="src-link">
          {isTg ? 'Открыть в Telegram' : item.lang === 'en' ? 'Оригинал (англ.)' : 'Читать на сайте'}
          <Icon name="external" size={12} />
        </a>
        {item.also.length > 0 &&
          (open ? (
            item.also.map((a) => (
              <a key={a.url} href={a.url} target="_blank" rel="noopener noreferrer" className="src-link ghost">
                {sources.get(a.sourceId)?.name ?? a.sourceId}
                <Icon name="external" size={12} />
              </a>
            ))
          ) : (
            <button type="button" className="src-link ghost" onClick={onToggle}>
              ещё в {item.also.length} {item.also.length === 1 ? 'источнике' : 'источниках'}
            </button>
          ))}
        {open && (
          <button type="button" className="src-link ghost" onClick={onHide}>
            Скрыть источник
          </button>
        )}
      </div>
    </article>
  );
}

