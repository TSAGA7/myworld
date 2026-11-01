import { useEffect, useState } from 'react';
import type { Camera } from '../../domain/hobby';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/kit';

const clock = (d: Date) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

/** «Онлайн-камеры» of a resort: the official page always, a stream or a snapshot when the resort publishes one. */
export function Cameras({ cams, resortName }: { cams: readonly Camera[]; resortName: string }) {
  const [open, setOpen] = useState<Camera | null>(null);
  if (!cams.length) return null;
  const page = cams.find((c) => c.kind === 'link');
  const live = cams.filter((c) => c.kind !== 'link');
  return (
    <section className="stack tight">
      <h3 className="h3" style={{ margin: 0 }}>
        Онлайн-камеры
      </h3>
      <div className="list">
        {live.map((c) => (
          <button key={c.url} type="button" className="list-row" onClick={() => setOpen(c)}>
            <Icon name={c.kind === 'hls' ? 'target' : 'image'} size={20} />
            <span className="grow">
              <span className="t block">{c.name}</span>
              <span className="s block">{[c.place, c.kind === 'hls' ? 'видеопоток' : 'снимок с камеры, обновляется'].filter(Boolean).join(' · ')}</span>
            </span>
            <Icon name="chevron" size={18} className="faint" />
          </button>
        ))}
        {page && (
          <a className="list-row" href={page.url} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={20} />
            <span className="grow">
              <span className="t block">{live.length ? 'Все камеры на сайте курорта' : 'Камеры на сайте курорта'}</span>
              <span className="s block ellipsis">{new URL(page.url).hostname.replace(/^www\./, '')}</span>
            </span>
            <Icon name="external" size={18} className="faint" />
          </a>
        )}
      </div>
      {open && <CameraView cam={open} page={page?.url ?? null} title={`${resortName}: ${open.name}`} onClose={() => setOpen(null)} />}
    </section>
  );
}

function CameraView({ cam, page, title, onClose }: { cam: Camera; page: string | null; title: string; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(() => Date.now());
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (cam.kind !== 'image') return;
    const t = window.setInterval(() => setTick(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [cam.kind]);
  const src = cam.kind === 'image' ? `${cam.url}${cam.url.includes('?') ? '&' : '?'}t=${Math.floor(tick / 60_000)}` : cam.url;
  return (
    <Sheet title={title} onClose={onClose}>
      {failed ? (
        <div className="empty">
          <span className="circle-btn" aria-hidden="true">
            <Icon name="cloud" />
          </span>
          <h3 className="h3">Камера сейчас недоступна</h3>
          <p>Курорт мог выключить её или изменить адрес. Попробуйте на сайте курорта.</p>
          {page && (
            <a className="btn glass-btn" href={page} target="_blank" rel="noopener noreferrer">
              <Icon name="external" size={18} /> Открыть сайт
            </a>
          )}
        </div>
      ) : cam.kind === 'hls' ? (
        <video className="cam-media" src={src} controls autoPlay muted playsInline onError={() => setFailed(true)} onLoadedData={() => setLoadedAt(new Date())} />
      ) : (
        <img className="cam-media" src={src} alt={cam.name} onError={() => setFailed(true)} onLoad={() => setLoadedAt(new Date())} />
      )}
      {!failed && (
        <p className="faint small" style={{ margin: 0 }}>
          {cam.kind === 'hls'
            ? 'Прямая трансляция с официальной камеры курорта.'
            : `Снимок с официальной камеры курорта, обновляется раз в минуту${loadedAt ? ` · загружен в ${clock(loadedAt)}` : ''}. Это не видео.`}
        </p>
      )}
    </Sheet>
  );
}
