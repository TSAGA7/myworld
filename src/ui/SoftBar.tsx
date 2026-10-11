import { Icon, type IconName } from './Icon';

export type Tab = 'planet' | 'countries' | 'trips' | 'me';
const TABS: ReadonlyArray<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'planet', label: 'Планета', icon: 'planet' },
  { id: 'countries', label: 'Страны', icon: 'flagStack' },
  { id: 'trips', label: 'Поездки', icon: 'suitcase' },
  { id: 'me', label: 'Профиль', icon: 'user' },
];

/** Floating glass bar: icons only; the active one grows into a lime pill with its label. */
export function SoftBar({ current }: { current: Tab }) {
  return (
    <nav className="softbar" aria-label="Разделы">
      {TABS.map((t) => {
        const on = current === t.id;
        return (
          <a key={t.id} href={`#/${t.id}`} aria-current={on ? 'page' : undefined} aria-label={t.label} className={on ? 'on' : ''}>
            <Icon name={t.icon} size={23} weight={on ? 2 : 1.7} />
            <span className="lbl" aria-hidden={!on}>
              {t.label}
            </span>
          </a>
        );
      })}
    </nav>
  );
}
