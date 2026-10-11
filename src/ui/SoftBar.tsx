import { Icon, type IconName } from './Icon';

export type Tab = 'planet' | 'countries' | 'trips';
const TABS: ReadonlyArray<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'planet', label: 'Планета', icon: 'planet' },
  { id: 'countries', label: 'Страны', icon: 'flagStack' },
  { id: 'trips', label: 'Путешествия', icon: 'suitcase' },
];

/** Floating glass bar with the three sections. The active one is a lime pill with its label. */
export function SoftBar({ current }: { current: Tab }) {
  return (
    <nav className="softbar" aria-label="Разделы">
      {TABS.map((t) => (
        <a key={t.id} href={`#/${t.id}`} aria-current={current === t.id ? 'page' : undefined}>
          <Icon name={t.icon} size={22} />
          <span className="lbl">{t.label}</span>
        </a>
      ))}
    </nav>
  );
}
