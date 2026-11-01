import { useEffect, useMemo, useState } from 'react';
import { go } from '../../app/router';
import { setSetting, useToday, useWorld } from '../../app/world';
import { checkPrice, PRICE_CHECK_URL, useFeedFile, type FeedState, type LiveCheck } from '../../feed/client';
import { ago, dayMonth, dayMonthFull, dealsFrom, durationLabel, fromCity, filterNews, liveVerdict, originForHome, rub, transfersLabel, type NewsFilter } from '../../feed/format';
import { TAG_LABEL, TAGS, type Deal, type DigestEntry, type FeedSource, type NewsItem } from '../../feed/schema';
import { Icon } from '../../ui/Icon';
import { Empty, Flag, Segmented, Sheet, Topo } from '../../ui/kit';

type Sub = 'digest' | 'news' | 'deals';
const SUBS: ReadonlyArray<{ value: Sub; label: string }> = [
  { value: 'deals', label: 'Билеты' },
  { value: 'digest', label: 'Дайджест' },
  { value: 'news', label: 'Новости' },
];

/** Hook for a live clock that refreshes "N мин назад" labels. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export function Feed({ route }: { route: string[] }) {
  const sub: Sub = route[1] === 'news' || route[1] === 'digest' ? route[1] : 'deals';
  return (
    <div className="screen feed-screen">
      <Topo />
      <div className="screen-inner">
        <header className="row between">
          <h1 className="h1">
            <span className="thin">Тревел-</span>лента
          </h1>
        </header>
        <Segmented label="Раздел ленты" value={sub} options={SUBS} onChange={(v) => go(`feed/${v}`, true)} className="feed-tabs" />
        {sub === 'digest' ? <DigestView /> : sub === 'news' ? <NewsView /> : <DealsView />}
      </div>
    </div>
  );
}

function StatusLine({ state, updatedAt, every }: { state: FeedState<unknown>; updatedAt: string | undefined; every: string }) {
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

const Loading = () => (
  <div className="empty">
    <span className="spinner" />
  </div>
);

/* ===================== Дайджест */

function DigestView() {
  const state = useFeedFile('digest');
  const today = useToday();
  const digests = state.data?.digests ?? [];
  const [date, setDate] = useState<string | null>(null);
  const d = digests.find((x) => x.date === date) ?? digests[0];

  if (!d) {
    if (state.status === 'loading') return <Loading />;
    return (
      <Empty
        icon="sparkle"
        title={state.status === 'offline' ? 'Нет связи' : 'Первый дайджест появится вечером'}
        text={state.status === 'offline' ? 'Дайджест загрузится, когда появится интернет.' : 'Каждый вечер ИИ собирает главное из тревел-каналов за сутки — со ссылками на источники.'}
        action={
          state.status === 'offline' ? (
            <button type="button" className="btn dark" onClick={state.reload}>
              Повторить
            </button>
          ) : (
            <button type="button" className="btn glass-btn" onClick={() => go('feed/news', true)}>
              Пока читать новости
            </button>
          )
        }
      />
    );
  }

  return (
    <>
      {digests.length > 1 && (
        <div className="chips" role="group" aria-label="День">
          {digests.map((x) => (
            <button key={x.date} type="button" className="chip" aria-pressed={x.date === d.date} onClick={() => setDate(x.date)}>
              {x.date === today ? 'Сегодня' : dayMonthFull(x.date)}
            </button>
          ))}
        </div>
      )}
      <article className="card digest">
        <header className="digest-head">
          <span className="digest-ic" aria-hidden="true">
            ✨
          </span>
          <div className="grow">
            <h2 className="h2">Дайджест за {dayMonthFull(d.date)}</h2>
            <p className="faint small">
              Написан ИИ по {d.sourcesCount} {d.sourcesCount % 10 === 1 && d.sourcesCount % 100 !== 11 ? 'источнику' : 'источникам'} · {new Date(d.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' })} МСК
            </p>
          </div>
        </header>
        <p className="digest-lead">{d.lead}</p>
        <DigestSection title="Главное" entries={d.main} />
        {d.other.length > 0 && <DigestSection title="Остальное" entries={d.other} />}
        <p className="faint tiny digest-note">Тексты пересказаны нейросетью и могут содержать неточности — подробности по ссылкам на источники.</p>
      </article>
    </>
  );
}

function DigestSection({ title, entries }: { title: string; entries: DigestEntry[] }) {
  return (
    <section className="digest-sec">
      <h3 className="h3">{title}</h3>
      {entries.map((e) => (
        <div key={e.title} className="digest-item">
          <b>{e.title}</b>
          <p>{e.text}</p>
          <div className="src-links">
            {e.links.map((l) => (
              <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="src-link">
                {l.name}
                <Icon name="external" size={12} />
              </a>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ===================== Новости */

function NewsView() {
  const state = useFeedFile('news');
  const now = useNow();
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const items = state.data?.items ?? [];
  const sources = useMemo(() => new Map((state.data?.sources ?? []).map((s) => [s.id, s])), [state.data]);
  const shown = useMemo(() => filterNews(items, filter).slice(0, 150), [items, filter]);
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
        {TAGS.filter((t) => (counts[t] ?? 0) > 0).map((t) => (
          <button key={t} type="button" className="chip" aria-pressed={filter === t} onClick={() => setFilter(t)}>
            {TAG_LABEL[t]} <span className="count">{counts[t]}</span>
          </button>
        ))}
      </div>
      <div className="news-list">
        {shown.map((n) => (
          <NewsCard key={n.id} item={n} source={sources.get(n.sourceId)} sources={sources} now={now} open={open === n.id} onToggle={() => setOpen(open === n.id ? null : n.id)} />
        ))}
      </div>
      <SourcesNote sources={state.data?.sources ?? []} />
    </>
  );
}

function NewsCard({ item, source, sources, now, open, onToggle }: { item: NewsItem; source: FeedSource | undefined; sources: Map<string, FeedSource>; now: Date; open: boolean; onToggle: () => void }) {
  const isTg = item.url.startsWith('https://t.me/');
  return (
    <article className={`card tight news-card ${open ? 'open' : ''}`}>
      <button type="button" className="news-main" onClick={onToggle} aria-expanded={open}>
        <span className="news-meta faint small">
          <b className="news-src">{source?.name ?? item.sourceId}</b> · {ago(item.at, now)}
          {item.tags.includes('deal') && <span className="pill lime news-pill">Акция</span>}
        </span>
        <b className="news-title">{item.title}</b>
        {item.text && <span className="news-text">{item.text}</span>}
      </button>
      <div className="news-foot">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="src-link">
          {isTg ? 'Открыть в Telegram' : 'Читать на сайте'}
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
      </div>
    </article>
  );
}

function SourcesNote({ sources }: { sources: FeedSource[] }) {
  const ok = sources.filter((s) => s.ok);
  if (!ok.length) return null;
  return (
    <p className="faint tiny feed-sources">
      Источники: {ok.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ', '}
          <a href={s.url} target="_blank" rel="noopener noreferrer">
            {s.name}
          </a>
        </span>
      ))}
      . Показываем начало поста — полный текст у автора.
    </p>
  );
}

/* ===================== Билеты */

const SEEN_KEY = 'mw-feed-deals-seen';
const readSeen = (): string => {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
};

function DealsView() {
  const state = useFeedFile('deals');
  const { settings, cities } = useWorld();
  const now = useNow();
  const [picked, setPicked] = useState<Deal | null>(null);
  // Deals found after the previous visit get a «новое» mark; the mark is remembered on leaving.
  const [seen] = useState(readSeen);
  useEffect(() => {
    if (!state.data) return;
    const latest = state.data.updatedAt;
    return () => {
      try {
        localStorage.setItem(SEEN_KEY, latest);
      } catch {
        /* the mark is a convenience only */
      }
    };
  }, [state.data]);

  const origins = state.data?.origins ?? [];
  const homeName = settings.homeCityId ? cities.get(settings.homeCityId)?.name : undefined;
  const origin = settings.feedOrigin && origins.some((o) => o.code === settings.feedOrigin) ? settings.feedOrigin : (originForHome(origins, homeName) ?? origins[0]?.code ?? null);
  const list = useMemo(() => dealsFrom(state.data?.deals ?? [], origin), [state.data, origin]);

  if (!state.data) {
    if (state.status === 'loading') return <Loading />;
    return (
      <Empty
        icon="ticket"
        title={state.status === 'offline' ? 'Нет связи' : 'Сканер цен ещё не включён'}
        text={
          state.status === 'offline'
            ? 'Список выгодных билетов загрузится, когда появится интернет.'
            : 'Он начнёт работать после подключения ключа Travelpayouts: каждый час сравнивает цены Aviasales с обычными для направления и показывает билеты заметно дешевле.'
        }
        action={
          state.status === 'offline' ? (
            <button type="button" className="btn dark" onClick={state.reload}>
              Повторить
            </button>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <StatusLine state={state} updatedAt={state.data.updatedAt} every="цены каждый час" />
      <div className="chips" role="group" aria-label="Откуда">
        {origins.map((o) => (
          <button key={o.code} type="button" className="chip" aria-pressed={o.code === origin} onClick={() => void setSetting('feedOrigin', o.code)}>
            {fromCity(o.name)}
            <span className="count">{state.data?.deals.filter((d) => d.origin === o.code).length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty icon="ticket" title="Сейчас выгодных билетов нет" text="Как только цена на направление упадёт заметно ниже обычной, билет появится здесь." />
      ) : (
        <div className="deal-list">
          {list.map((d) => (
            <DealCard key={d.id} deal={d} isNew={!!seen && d.foundAt > seen} now={now} onOpen={() => setPicked(d)} />
          ))}
        </div>
      )}
      <p className="faint tiny feed-sources">
        Цены — самые дешёвые билеты, найденные пользователями Aviasales за последние двое суток. «Обычная» цена — медиана по этому направлению и месяцу. Цена у продавца может отличаться.
      </p>
      {picked && <DealSheet deal={picked} updatedAt={state.data.updatedAt} onClose={() => setPicked(null)} />}
    </>
  );
}

function DealCard({ deal, isNew, now, onOpen }: { deal: Deal; isNew: boolean; now: Date; onOpen: () => void }) {
  return (
    <button type="button" className="card tight deal-card" onClick={onOpen}>
      <span className="deal-top">
        <span className="deal-route">
          <b>{deal.destinationName}</b>
          {deal.countryCode && <Flag id={deal.countryCode} size="sm" />}
        </span>
        <span className="deal-off num">−{deal.discount}%</span>
      </span>
      <span className="deal-sub faint small">
        {fromCity(deal.originName)} · {[transfersLabel(deal.transfers), deal.airline].filter(Boolean).join(', ')}
      </span>
      <span className="deal-bottom">
        <span>
          <b className="deal-price num">{rub(deal.price)}</b>
          <s className="faint small num">{rub(deal.usual)}</s>
        </span>
        <span className="deal-date">
          {isNew && <span className="pill lime">новое</span>}
          <span className="num">{dayMonth(deal.departAt)}</span>
        </span>
      </span>
      <span className="faint tiny">Найдено {ago(deal.foundAt, now)}</span>
    </button>
  );
}

function DealSheet({ deal, updatedAt, onClose }: { deal: Deal; updatedAt: string; onClose: () => void }) {
  const today = useToday();
  const now = useNow();
  const [live, setLive] = useState<LiveCheck | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const date = deal.departAt.slice(0, 10);

  const run = () => {
    if (!PRICE_CHECK_URL) return;
    setBusy(true);
    setErr(null);
    checkPrice(deal.origin, deal.destination, date)
      .then(setLive)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Не удалось проверить цену'))
      .finally(() => setBusy(false));
  };
  // A live check right when the deal is opened.
  useEffect(run, [deal.id]);

  const verdict = live ? liveVerdict(deal.price, live.price) : null;
  const buy = live?.link ?? deal.link;
  return (
    <Sheet
      title={`${deal.originName} → ${deal.destinationName}`}
      onClose={onClose}
      footer={
        <a className="btn lime block" href={buy} target="_blank" rel="noopener noreferrer">
          <Icon name="plane" size={18} /> Купить на Aviasales
        </a>
      }
    >
      <div className="deal-sheet">
        <div className="deal-big">
          <b className="num">{rub(live?.price ?? deal.price)}</b>
          <span className="deal-off num">−{deal.discount}%</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Обычно на этом направлении в этом месяце — около {rub(deal.usual)}. Экономия {rub(deal.usual - deal.price)}.
        </p>
        <div className="list">
          <div className="list-row">
            <Icon name="calendar" size={20} />
            <span className="grow">Вылет {dayMonthFull(date)}{date < today ? ' — уже прошёл' : ''}</span>
          </div>
          <div className="list-row">
            <Icon name="route" size={20} />
            <span className="grow">
              {transfersLabel(deal.transfers)}
              {deal.durationMin ? ` · в пути ${durationLabel(deal.durationMin)}` : ''}
            </span>
          </div>
          {deal.airline && (
            <div className="list-row">
              <Icon name="plane" size={20} />
              <span className="grow">{deal.airline}</span>
            </div>
          )}
        </div>

        {PRICE_CHECK_URL ? (
          <div className={`live-check ${verdict?.kind ?? ''}`} aria-live="polite">
            {busy ? (
              <>
                <span className="spinner sm" /> Проверяем цену на {dayMonthFull(date)}…
              </>
            ) : err ? (
              <>
                <span className="grow">{err}</span>
                <button type="button" className="link-btn" onClick={run}>
                  Повторить
                </button>
              </>
            ) : verdict && live ? (
              <>
                <Icon name={verdict.kind === 'dearer' || verdict.kind === 'gone' ? 'info' : 'check'} size={18} />
                <span className="grow">
                  {verdict.text}
                  <span className="faint tiny block">проверено {ago(live.checkedAt, now)}</span>
                </span>
                <button type="button" className="circle-btn sm" onClick={run} aria-label="Проверить ещё раз">
                  <Icon name="rotate" size={16} />
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <p className="faint small" style={{ margin: 0 }}>
            Цена проверена {ago(updatedAt, now)}, следующая проверка — в течение часа.
          </p>
        )}
      </div>
    </Sheet>
  );
}
