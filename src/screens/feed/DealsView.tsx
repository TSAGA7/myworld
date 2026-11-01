import { useEffect, useMemo, useState } from 'react';
import { setSetting, useToday, useWorld } from '../../app/world';
import { checkPrice, PRICE_CHECK_URL, useFeedFile, type LiveCheck } from '../../feed/client';
import { ago, dayMonth, dayMonthFull, dealsFrom, durationLabel, fromCity, liveVerdict, originForHome, rub, transfersLabel } from '../../feed/format';
import type { Deal } from '../../feed/schema';
import { Icon } from '../../ui/Icon';
import { Empty, Flag, Sheet } from '../../ui/kit';
import { Loading, StatusLine, useNow } from './common';

/* ===================== Билеты */

const SEEN_KEY = 'mw-feed-deals-seen';
const readSeen = (): string => {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
};

export function DealsView() {
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
