import { useEffect, useMemo, useState } from 'react';
import { setSetting, useToday, useWorld } from '../../app/world';
import { checkPrice, PRICE_CHECK_URL, useFeedFile, type LiveCheck } from '../../feed/client';
import type { RoutesFile } from '../../feed/deals';
import {
  type AirportCoords,
  currentPrice,
  type DestKind,
  destKinds,
  fitsPlace,
  fitsTrip,
  hobbyDestinations,
  nearestAirport,
  nearestOrigin,
  type Point,
  searchUrl,
  type TripFocus,
  tripPrices,
  watchId,
} from '../../feed/destinations';
import { useToast } from '../../app/toast';
import { formatRange } from '../../domain/dates';
import { countryName } from '../../geo/reference';
import { pointOf, setDealsFocus, useAirportCoords, useDealsFocus, useHobbyPoints } from './dealsContext';
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
  const routesState = useFeedFile('routes');
  const routes = routesState.data;
  const { settings, cities } = useWorld();
  const now = useNow();
  const toast = useToast();
  const airports = useAirportCoords();
  const hobbyPoints = useHobbyPoints();
  const focus = useDealsFocus();
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

  const point = useMemo(() => pointOf(routes ?? null, airports), [routes, airports]);
  const origins = state.data?.origins ?? [];
  const home = settings.homeCityId ? cities.get(settings.homeCityId) : undefined;
  const homePoint = home && home.lat !== null && home.lon !== null ? { lat: home.lat, lon: home.lon } : null;
  const homeOrigin = originForHome(origins, home?.name) ?? (origins.length ? nearestOrigin(homePoint, origins, point) : null);
  const origin = settings.feedOrigin && origins.some((o) => o.code === settings.feedOrigin) ? settings.feedOrigin : (homeOrigin ?? origins[0]?.code ?? null);

  // «Куда»: everything, ski, surf — by the hobbies that are on.
  const kinds = destKinds(settings.travelTracking, !!settings.riderType, settings.surf);
  const [kindPick, setKind] = useState<DestKind>(kinds[0] ?? 'all');
  const kind = kinds.includes(kindPick) ? kindPick : (kinds[0] ?? 'all');
  const hobbyDest = useMemo(
    () => hobbyDestinations(new Set((state.data?.deals ?? []).map((d) => d.destination)), point, hobbyPoints.resorts, hobbyPoints.spots),
    [state.data, point, hobbyPoints],
  );
  const all = useMemo(() => dealsFrom(state.data?.deals ?? [], origin), [state.data, origin]);
  const list = kind === 'ski' ? all.filter((d) => hobbyDest.ski.has(d.destination)) : kind === 'surf' ? all.filter((d) => hobbyDest.surf.has(d.destination)) : all;

  // Price watch: what changed since the user last looked.
  const watches = settings.priceWatch;
  const watchRows = watches.map((w) => ({ w, now: currentPrice(w, state.data?.deals ?? [], routes ?? null) }));
  useEffect(() => {
    if (!state.data || !watches.length) return;
    const drops = watchRows.filter((r) => r.now !== null && r.now < r.w.seenPrice - Math.max(100, r.w.seenPrice * 0.02));
    if (!drops.length) return;
    toast(drops.length === 1 && drops[0] ? `Подешевело: ${drops[0].w.destinationName} — ${rub(drops[0].now as number)}` : `Подешевели ${drops.length} направления из «Слежу за ценой»`);
  }, [state.data?.updatedAt, routes?.updatedAt]);
  const markSeen = () => void setSetting('priceWatch', watches.map((w) => { const p = watchRows.find((r) => r.w.id === w.id)?.now; return p ? { ...w, seenPrice: p } : w; }));

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

  const kindLabel: Record<DestKind, string> = { all: 'Все', ski: settings.riderType === 'ski' ? '⛷️ На горнолыжку' : '🏂 На горнолыжку', surf: '🏄 На сёрфинг' };
  return (
    <>
      <StatusLine state={state} updatedAt={state.data.updatedAt} />
      {focus && origin && <TripDeals focus={focus} origin={origin} deals={state.data.deals} routes={routes ?? null} point={point} airports={airports} onOpen={setPicked} now={now} />}
      {watches.length > 0 && (
        <section className="card tight watch-card">
          <div className="row between">
            <b className="row" style={{ gap: 8 }}>
              <Icon name="bellOn" size={18} /> Слежу за ценой
            </b>
            {watchRows.some((r) => r.now !== null && r.now !== r.w.seenPrice) && (
              <button type="button" className="link-btn small" onClick={markSeen}>
                Отметить просмотренным
              </button>
            )}
          </div>
          {watchRows.map(({ w, now: p }) => (
            <div key={w.id} className="watch-row">
              <span className="grow">
                <span className="t block">
                  {w.originName} → {w.destinationName}
                </span>
                <span className="s block faint">{monthName(w.month)} · следите с {rub(w.startPrice)}</span>
              </span>
              <span className="num watch-price">
                {p === null ? <span className="faint small">нет цены</span> : <b className={p < w.seenPrice ? 'down' : p > w.seenPrice ? 'up' : ''}>{rub(p)}</b>}
                {p !== null && p !== w.seenPrice && <span className={`tiny ${p < w.seenPrice ? 'down' : 'up'}`}>{p < w.seenPrice ? '▼' : '▲'} {rub(Math.abs(p - w.seenPrice))}</span>}
              </span>
              <button type="button" className="icon-plain" aria-label={`Не следить: ${w.destinationName}`} onClick={() => void setSetting('priceWatch', watches.filter((x) => x.id !== w.id))}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </section>
      )}
      <div className="chips" role="group" aria-label="Откуда и куда">
        {origins.map((o) => (
          <button key={o.code} type="button" className="chip" aria-pressed={o.code === origin} onClick={() => void setSetting('feedOrigin', o.code)}>
            {fromCity(o.name)}
            <span className="count">{state.data?.deals.filter((d) => d.origin === o.code).length}</span>
          </button>
        ))}
      </div>
      {kinds.length > 1 && (
        <div className="chips" role="group" aria-label="Куда">
          {kinds.map((k) => (
            <button key={k} type="button" className="chip kind-chip" aria-pressed={k === kind} onClick={() => setKind(k)}>
              {kindLabel[k]}
              {k !== 'all' && <span className="count">{all.filter((d) => (k === 'ski' ? hobbyDest.ski : hobbyDest.surf).has(d.destination)).length}</span>}
            </button>
          ))}
        </div>
      )}
      {list.length === 0 ? (
        <Empty
          icon="ticket"
          title={kind === 'ski' ? 'Выгодных билетов на горнолыжку сейчас нет' : kind === 'surf' ? 'Выгодных билетов к сёрф-спотам сейчас нет' : 'Сейчас выгодных билетов нет'}
          text={kind === 'all' ? 'Как только цена на направление упадёт заметно ниже обычной, билет появится здесь.' : 'Здесь — города с аэропортом рядом с курортами и спотами (до 150 км до горнолыжного курорта, до 120 км до сёрф-спота). Появятся, как только цена упадёт.'}
        />
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

const MONTHS_IN = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
const monthName = (ym: string) => `в ${MONTHS_IN[Number(ym.slice(5, 7)) - 1] ?? ym}`;

/** «Выгодные забросы» for a trip: matching deals first, then the cheapest found prices, then a search for the exact dates. */
function TripDeals({
  focus,
  origin,
  deals,
  routes,
  point,
  airports,
  onOpen,
  now,
}: {
  focus: TripFocus;
  origin: string;
  deals: readonly Deal[];
  routes: RoutesFile | null;
  point: (code: string) => Point | null;
  airports: AirportCoords;
  onOpen: (d: Deal) => void;
  now: Date;
}) {
  const fit = deals.filter((d) => d.origin === origin && fitsTrip(focus, d, point(d.destination))).sort((a, b) => a.price - b.price);
  const near = deals.filter((d) => d.origin === origin && !fit.includes(d) && fitsPlace(focus, d.countryCode, point(d.destination))).sort((a, b) => a.price - b.price).slice(0, 3);
  const cheapest = tripPrices(focus, origin, routes, point);
  const target = focus.cities[0] ? nearestAirport(focus.cities[0], airports) : null;
  const originName = ORIGIN_NAME[origin] ?? origin;
  const place = focus.cities.length ? focus.cities.map((c) => c.name).slice(0, 3).join(', ') : focus.countries.map(countryName).join(', ');
  return (
    <section className="trip-deals card tight">
      <div className="row between">
        <div className="grow">
          <b className="block">Выгодные забросы · {focus.title}</b>
          <span className="faint small">
            {fromCity(originName)} → {place} · {formatRange(focus.start, focus.end)}
          </span>
        </div>
        <button type="button" className="icon-plain" aria-label="Убрать подборку под поездку" onClick={() => setDealsFocus(null)}>
          <Icon name="close" size={18} />
        </button>
      </div>
      {fit.length > 0 ? (
        <div className="deal-list">
          {fit.map((d) => (
            <DealCard key={d.id} deal={d} isNew={false} now={now} onOpen={() => onOpen(d)} highlight />
          ))}
        </div>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          На ваши даты выгодных билетов сейчас нет{near.length ? ' — но есть в те же места в другие дни:' : '.'}
        </p>
      )}
      {near.length > 0 && (
        <div className="deal-list">
          {near.map((d) => (
            <DealCard key={d.id} deal={d} isNew={false} now={now} onOpen={() => onOpen(d)} />
          ))}
        </div>
      )}
      {cheapest.length > 0 && (
        <div className="list">
          {cheapest.slice(0, 3).map((r) => (
            <a key={`${r[1]}-${r[4]}`} className="list-row" href={searchUrl(r[0], r[1], r[4], null)} target="_blank" rel="noopener noreferrer">
              <Icon name="plane" size={18} />
              <span className="grow">
                <span className="t block">{routes?.cities[r[1]]?.[0] ?? r[1]} — от {rub(r[3])}</span>
                <span className="s block">самый дешёвый в {MONTHS_IN[Number(r[2].slice(5, 7)) - 1]}: {dayMonth(r[4])}, {transfersLabel(r[5])}</span>
              </span>
              <Icon name="external" size={16} />
            </a>
          ))}
        </div>
      )}
      {target && (
        <a className="btn glass-btn block" href={searchUrl(origin, target, focus.start, focus.end || null)} target="_blank" rel="noopener noreferrer">
          <Icon name="search" size={18} /> Искать на ваши даты
        </a>
      )}
    </section>
  );
}

const ORIGIN_NAME: Record<string, string> = { MOW: 'Москва', LED: 'Санкт-Петербург', KZN: 'Казань', SVX: 'Екатеринбург', OVB: 'Новосибирск', KRR: 'Краснодар', AER: 'Сочи' };

function DealCard({ deal, isNew, now, onOpen, highlight = false }: { deal: Deal; isNew: boolean; now: Date; onOpen: () => void; highlight?: boolean }) {
  return (
    <button type="button" className={`card tight deal-card ${highlight ? 'hl' : ''}`} onClick={onOpen}>
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
  const { settings } = useWorld();
  const toast = useToast();
  const wid = watchId(deal.origin, deal.destination, deal.departAt);
  const watching = settings.priceWatch.some((w) => w.id === wid);
  const toggleWatch = () => {
    if (watching) {
      void setSetting('priceWatch', settings.priceWatch.filter((w) => w.id !== wid));
      toast('Больше не следим за ценой');
      return;
    }
    const w = { id: wid, origin: deal.origin, originName: deal.originName, destination: deal.destination, destinationName: deal.destinationName, month: deal.departAt.slice(0, 7), startPrice: deal.price, seenPrice: deal.price, at: new Date().toISOString() };
    void setSetting('priceWatch', [...settings.priceWatch, w]);
    toast(`Следим за ценой ${deal.originName} → ${deal.destinationName} — изменения будут вверху «Билетов»`);
  };
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
      headExtra={
        <button type="button" className={`circle-btn sm bell-btn ${watching ? 'on' : ''}`} aria-pressed={watching} aria-label={watching ? 'Не следить за ценой' : 'Следить за ценой'} onClick={toggleWatch}>
          <Icon name={watching ? 'bellOn' : 'bell'} size={18} />
        </button>
      }
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
