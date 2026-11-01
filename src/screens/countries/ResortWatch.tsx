import { useEffect, useMemo, useState } from 'react';
import { enablePush, syncPush, usePushState } from '../../app/push';
import { createPortal } from 'react-dom';
import { endHere, extendHere, setMute, setNotify, startHere } from '../../app/hobbyActions';
import { go } from '../../app/router';
import { useToast } from '../../app/toast';
import { useWorld } from '../../app/world';
import { formatDate } from '../../domain/dates';
import { placeTitle, type Resort, resortWatch } from '../../domain/hobby';
import { useFeedFile } from '../../feed/client';
import { ago } from '../../feed/format';
import { currentNotices, type ResortNotice } from '../../feed/resortStatus';
import { useCatalog } from '../../geo/hobbyCatalog';
import { Icon } from '../../ui/Icon';
import { CenterCard } from '../../ui/UpdateCard';

/** «Сейчас тут» state of all resorts (resolved through the catalog). */
export function useResortWatch() {
  const { hobby, settings } = useWorld();
  const cat = useCatalog('resorts', !!settings.riderType);
  const watch = useMemo(() => resortWatch(hobby, cat.index, new Date()), [hobby, cat.index]);
  return { watch, cat };
}

function Notice({ n, now, resortName }: { n: ResortNotice; now: Date; resortName?: string }) {
  return (
    <div className={`notice ${n.level}`}>
      <span className="notice-dot" aria-label={n.level === 'critical' ? 'важно' : 'информация'} />
      <div className="grow">
        <p className="notice-text">
          {resortName && <b>{resortName}: </b>}
          {n.text.length > 220 ? `${n.text.slice(0, 220)}…` : n.text}
        </p>
        <a className="src-link" href={n.url} target="_blank" rel="noopener noreferrer">
          @{n.source} · {ago(n.at, now)} <Icon name="external" size={12} />
        </a>
      </div>
    </div>
  );
}

/** Block on the resort page: «Сейчас тут», notices switch, and the latest official notices with source and time. */
export function ResortLive({ resort, visited }: { resort: Resort; visited: boolean }) {
  const { settings } = useWorld();
  const toast = useToast();
  const { watch } = useResortWatch();
  const status = useFeedFile('resort-status');
  const now = new Date();
  const here = watch.here.has(resort.id);
  const notify = watch.notify.has(resort.id);
  const { hobby } = useWorld();
  const herMark = hobby.find((m) => m.what === 'here' && m.kind === 'resort' && [resort.id, ...resort.alt].includes(m.placeId));
  const src = status.data?.sources.find((s) => s.resortId === resort.id);
  const notices = currentNotices(status.data?.items ?? [], new Set([resort.id]), now);
  const hasSource = !!resort.telegram;

  return (
    <section className="card flat stack tight resort-live">
      <div className="row between">
        <h3 className="h3" style={{ margin: 0 }}>
          Сейчас на курорте
        </h3>
        {here && herMark?.until && <span className="pill lime">вы здесь до {formatDate(herMark.until.slice(0, 10))}</span>}
      </div>
      {here ? (
        <div className="row">
          <button type="button" className="btn ghost grow" onClick={() => void endHere(resort).then(() => toast(`Пребывание на курорте ${placeTitle(resort)} завершено`))}>
            Завершить пребывание
          </button>
        </div>
      ) : (
        <button type="button" className="btn dark block" onClick={() => void startHere(toast, resort, { travelTracking: settings.travelTracking, visited })}>
          <Icon name="pin" size={18} /> Сейчас тут
        </button>
      )}
      {hasSource ? (
        <label className="list-row tap" style={{ padding: '6px 2px', minHeight: 0 }}>
          <span className="grow">
            <span className="t">Оперативные сообщения</span>
            <span className="s block">{here ? 'Включаются, пока вы тут. Можно выключить.' : 'Можно получать и не будучи на курорте.'}</span>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={notify}
            onChange={(e) => void (here ? setMute(resort, !e.target.checked) : setNotify(resort, e.target.checked))}
          />
        </label>
      ) : (
        <p className="muted small" style={{ margin: 0 }}>
          У курорта пока нет подключённого официального канала — оперативных сообщений о трассах и подъёмниках не будет.
        </p>
      )}
      {hasSource && notify && <PushRow resorts={[...watch.notify]} />}
      {hasSource &&
        (notices.length ? (
          <div className="stack tight">
            {notices.slice(0, 5).map((n) => (
              <Notice key={n.id} n={n} now={now} />
            ))}
          </div>
        ) : (
          <p className="faint small" style={{ margin: 0 }}>
            {src && !src.ok
              ? `Канал курорта сейчас не отвечает${src.lastSyncAt ? ` — последнее обновление ${ago(src.lastSyncAt, now)}` : ''}.`
              : `За последние сутки сообщений о закрытии трасс и подъёмников нет${status.data ? ` · проверено ${ago(status.data.updatedAt, now)}` : ''}.`}
          </p>
        ))}
    </section>
  );
}

/** Top of «Лыжи / Борд»: fresh notices of the resorts you are at or follow. */
export function WatchedNotices() {
  const { watch, cat } = useResortWatch();
  const status = useFeedFile('resort-status');
  const now = new Date();
  const notices = currentNotices(status.data?.items ?? [], watch.notify, now);
  if (!watch.notify.size) return null;
  const names = [...watch.here].map((id) => cat.index.get(id)).filter((r): r is Resort => !!r);
  return (
    <section className="card stack tight resort-live" aria-label="Сообщения курортов">
      <div className="row between">
        <h3 className="h3" style={{ margin: 0 }}>
          {names.length ? `Вы на курорте ${names.map(placeTitle).join(', ')}` : 'Мои курорты'}
        </h3>
        <Icon name="news" size={18} />
      </div>
      {notices.length ? (
        [...notices]
          .sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1))
          .slice(0, 6)
          .map((n) => {
            const r = cat.index.get(n.resortId);
            return (
              <button key={n.id} type="button" className="notice-btn" onClick={() => r && go(`countries/@resort/${encodeURIComponent(r.id)}`)}>
                <Notice n={n} now={now} resortName={r ? placeTitle(r) : undefined} />
              </button>
            );
          })
      ) : (
        <p className="faint small" style={{ margin: 0 }}>
          Свежих сообщений о закрытии трасс и подъёмников нет{status.data ? ` · проверено ${ago(status.data.updatedAt, now)}` : ''}.
        </p>
      )}
    </section>
  );
}

/** «Сейчас тут» does not last forever: after a week the app asks once. */
export function HereCheck() {
  const { settings } = useWorld();
  const { watch, cat } = useResortWatch();
  const [skipped, setSkipped] = useState<string[]>([]);
  usePushSync([...watch.notify], cat.items.length > 0);
  if (!settings.riderType) return null;
  const id = watch.expired.find((x) => !skipped.includes(x));
  const r = id ? cat.index.get(id) : undefined;
  if (!r) return null;
  return createPortal(
    <CenterCard
      title={`Вы ещё на курорте ${placeTitle(r)}?`}
      text="Пока вы на курорте, приходят его оперативные сообщения о трассах и подъёмниках."
      primary={{ label: 'Да, ещё неделю', onClick: () => void extendHere(r) }}
      secondary={{
        label: 'Нет, уехал',
        onClick: () => {
          setSkipped((s) => [...s, r.id]);
          void endHere(r);
        },
      }}
    />,
    document.body,
  );
}

/** «Присылать на телефон»: Web Push for the resorts whose notices are on. */
function PushRow({ resorts }: { resorts: string[] }) {
  const [st, setSt] = usePushState();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!st || st === 'unsupported') return null;
  if (st === 'on') return <p className="faint small" style={{ margin: 0 }}>Push-уведомления на телефон включены.</p>;
  if (st === 'install')
    return (
      <p className="muted small" style={{ margin: 0 }}>
        Чтобы сообщения приходили, даже когда приложение закрыто, добавьте MY WORLD на экран «Домой»: в Safari «Поделиться» → «На экран „Домой“».
      </p>
    );
  if (st === 'denied')
    return (
      <p className="muted small" style={{ margin: 0 }}>
        Уведомления для MY WORLD запрещены — разрешите их в настройках телефона (Настройки → Уведомления).
      </p>
    );
  return (
    <button
      type="button"
      className="btn glass-btn block"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        enablePush(resorts)
          .then((r) => {
            setSt(r);
            toast(r === 'on' ? 'Сообщения курорта будут приходить на телефон' : 'Уведомления не разрешены');
          })
          .catch((e: unknown) => toast(`Не удалось включить уведомления: ${e instanceof Error ? e.message : e}`))
          .finally(() => setBusy(false));
      }}
    >
      <Icon name="phone" size={18} /> Присылать на телефон
    </button>
  );
}

/** Keeps the push subscription's resort list in step with the switches (only when push is already on). */
function usePushSync(ids: readonly string[], ready: boolean) {
  const sig = [...ids].sort().join(',');
  useEffect(() => {
    if (!ready) return;
    let last = '';
    try {
      last = localStorage.getItem('mw-push-resorts') ?? '';
    } catch {
      /* private mode */
    }
    if (last === sig) return;
    void syncPush(sig ? sig.split(',') : []).then(
      () => {
        try {
          localStorage.setItem('mw-push-resorts', sig);
        } catch {
          /* private mode */
        }
      },
      () => undefined,
    );
  }, [sig, ready]);
}
