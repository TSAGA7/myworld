import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorld } from '../../app/world';
import { type AchView, fromRider, collapsedView, started } from '../../domain/achievementView';
import { riderAchievements, type VisitedResort } from '../../domain/riderAchievements';
import { useCatalog } from '../../geo/hobbyCatalog';
import { countryName } from '../../geo/reference';
import { AchIcon } from '../../ui/AchIcon';
import { CenterCard } from '../../ui/UpdateCard';

/** Window in the centre of the screen: what the achievement is given for and what counted. */
export { fromTravel } from '../../domain/achievementView';

export function AchievementInfo({ a, onClose }: { a: AchView; onClose: () => void }) {
  return createPortal(
    <div onClick={(e) => e.target === e.currentTarget.firstChild && onClose()}>
      <CenterCard
        badge={<AchIcon icon={a.icon} size={a.icon.startsWith('svg:') ? 40 : 26} />}
        title={a.title}
        text={
          <span className="stack tight">
            <span className="ach-status">{a.done ? 'Получено' : started(a) ? `В процессе · ${a.value} из ${a.target}` : 'Ещё не получено'}</span>
            <span>{a.why}</span>
            {a.places && (
              <span className="ach-places">
                {a.places.map((p) => (
                  <span key={p.label} className={p.got ? 'got' : ''}>
                    {p.got ? '✓' : '○'} {p.label}
                    {p.got && p.via && p.via !== p.label && <span className="faint"> · {p.via}</span>}
                  </span>
                ))}
              </span>
            )}
            {a.details && a.details.length > 0 && (
              <span className="ach-places">
                {a.details.map((d) => (
                  <span key={d} className="got">
                    ✓ {d}
                  </span>
                ))}
              </span>
            )}
            {a.details && a.details.length === 0 && !a.done && <span className="faint">Пока нет.</span>}
            {a.rider && !a.done && <span className="faint small">Считаются курорты с отметкой «Был здесь» — «Мой мир → Rider».</span>}
          </span>
        }
        primary={{ label: 'Понятно', onClick: onClose }}
      />
    </div>,
    document.body,
  );
}

/** One tile of the grid; only tiles with a short «за что» open the window. */
export function AchTile({ a, onOpen }: { a: AchView; onOpen: () => void }) {
  const body = (
    <>
      <span className="ach-ic">
        <AchIcon icon={a.icon} />
      </span>
      <b>{a.title}</b>
      <span className="faint tiny">{a.tile}</span>
      {!a.done && (
        <div className="meter thin" aria-hidden="true">
          <i style={{ width: `${(a.value / a.target) * 100}%` }} />
        </div>
      )}
    </>
  );
  return a.opens ? (
    <button type="button" className={`ach ${a.done ? 'done' : ''}`} onClick={onOpen} aria-label={`${a.title}: ${a.done ? 'получено' : 'не получено'}`}>
      {body}
    </button>
  ) : (
    <div className={`ach ${a.done ? 'done' : ''}`}>{body}</div>
  );
}

/**
 * A titled grid of achievements. Collapsed (default) it shows only the ones already got and the started ones;
 * «Развернуть» next to the counter shows all.
 */
export function AchSection({ title, list }: { title: string; list: AchView[] }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<AchView | null>(null);
  const done = list.filter((a) => a.done);
  const collapsed = collapsedView(list);
  const going = collapsed.filter((a) => !a.done).sort((a, b) => b.value / b.target - a.value / a.target);
  const hidden = list.filter((a) => !collapsed.includes(a));
  const shown = all ? [...done, ...going, ...hidden] : [...done, ...going];
  const rest = hidden;
  return (
    <section className="stack tight">
      <div className="section-title">
        <h2 className="h2">{title}</h2>
        <span className="row tight-row">
          <span className="muted small num">
            {done.length} из {list.length}
          </span>
          {(rest.length > 0 || all) && (
            <button type="button" className="link-btn small" onClick={() => setAll((x) => !x)}>
              {all ? 'Свернуть' : 'Развернуть'}
            </button>
          )}
        </span>
      </div>
      {shown.length > 0 ? (
        <div className="ach-grid">
          {shown.map((a) => (
            <AchTile key={a.id} a={a} onOpen={() => setOpen(a)} />
          ))}
        </div>
      ) : (
        <p className="faint small" style={{ margin: 0 }}>
          Пока ни одного — нажмите «Развернуть», чтобы посмотреть, что можно получить.
        </p>
      )}
      {open && <AchievementInfo a={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/** Achievements of the Rider hobby: shown while Rider is on. */
export function RiderAchievements() {
  const { settings, hobby } = useWorld();
  const catalog = useCatalog('resorts', !!settings.riderType);
  const list = useMemo(() => {
    const visited: VisitedResort[] = hobby
      .filter((m) => m.what === 'visit' && m.kind === 'resort')
      .map((m) => ({ id: m.placeId, resort: catalog.index.get(m.placeId) ?? null }));
    return riderAchievements(visited, countryName).map(fromRider);
  }, [hobby, catalog]);
  if (!settings.riderType) return null;
  return <AchSection title="Достижения райдера" list={list} />;
}
