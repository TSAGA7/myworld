import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useWorld } from '../../app/world';
import type { Achievement } from '../../domain/achievements';
import { type RiderAchievement, riderAchievements, type VisitedResort } from '../../domain/riderAchievements';
import { useCatalog } from '../../geo/hobbyCatalog';
import { AchIcon } from '../../ui/AchIcon';
import { CenterCard } from '../../ui/UpdateCard';

export type AnyAchievement = (Achievement & { places?: undefined }) | (RiderAchievement & { hint?: undefined });

/** Window in the centre of the screen: what the achievement is given for and how far the user is. */
export function AchievementInfo({ a, onClose }: { a: AnyAchievement; onClose: () => void }) {
  const why = a.places ? a.why : a.hint;
  return createPortal(
    <div onClick={(e) => e.target === e.currentTarget.firstChild && onClose()}>
      <CenterCard
        badge={<AchIcon icon={a.icon} size={a.icon.startsWith('svg:') ? 40 : 26} />}
        title={a.title}
        text={
          <span className="stack tight">
            <span className="ach-status">{a.done ? 'Получено' : 'Ещё не получено'}</span>
            <span>{why}</span>
            {a.places && a.places.length > 1 && (
              <span className="ach-places">
                {a.places.map((p, i) => (
                  <span key={p.label} className={a.got[i] ? 'got' : ''}>
                    {a.got[i] ? '✓' : '○'} {p.label}
                  </span>
                ))}
              </span>
            )}
            {!a.places && !a.done && (
              <span className="faint">
                Прогресс: {a.value.toLocaleString('ru-RU')} из {a.target.toLocaleString('ru-RU')}
              </span>
            )}
            {a.places && !a.done && <span className="faint small">Отметьте «Был здесь» на курорте в «Мой мир → Rider» или посещённый город.</span>}
          </span>
        }
        primary={{ label: 'Понятно', onClick: onClose }}
      />
    </div>,
    document.body,
  );
}

/** One tile of the achievements grid; a tap opens the window. */
export function AchTile({ a, onOpen }: { a: AnyAchievement; onOpen: () => void }) {
  return (
    <button type="button" className={`ach ${a.done ? 'done' : ''}`} onClick={onOpen} aria-label={`${a.title}: ${a.done ? 'получено' : 'не получено'}`}>
      <span className="ach-ic">
        <AchIcon icon={a.icon} />
      </span>
      <b>{a.title}</b>
      <span className="faint tiny">{a.places ? a.places.map((p) => p.label).join(', ') : a.hint}</span>
      {!a.done && (
        <div className="meter thin" aria-hidden="true">
          <i style={{ width: `${(a.value / a.target) * 100}%` }} />
        </div>
      )}
    </button>
  );
}

/** Achievements of the Rider hobby: shown while Rider is on. */
export function RiderAchievements() {
  const { settings, hobby, world, cities } = useWorld();
  const catalog = useCatalog('resorts', !!settings.riderType);
  const [open, setOpen] = useState<RiderAchievement | null>(null);
  const list = useMemo(() => {
    const visited: VisitedResort[] = hobby
      .filter((m) => m.what === 'visit' && m.kind === 'resort')
      .map((m) => ({ id: m.placeId, resort: catalog.index.get(m.placeId) ?? null }));
    const visitedCities = [...world.visitedCityIds].map((id) => cities.get(id)).filter((c) => !!c);
    return riderAchievements(visited, visitedCities);
  }, [hobby, catalog, world, cities]);
  if (!settings.riderType) return null;
  const done = list.filter((a) => a.done).length;
  return (
    <section className="stack tight">
      <div className="section-title">
        <h2 className="h2">Достижения райдера</h2>
        <span className="muted small num">
          {done} из {list.length}
        </span>
      </div>
      <div className="ach-grid">
        {[...list].sort((a, b) => Number(b.done) - Number(a.done)).map((a) => (
          <AchTile key={a.id} a={a} onOpen={() => setOpen(a)} />
        ))}
      </div>
      {open && <AchievementInfo a={open} onClose={() => setOpen(null)} />}
    </section>
  );
}
