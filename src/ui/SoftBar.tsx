import type { MouseEvent } from 'react';
import { go } from '../app/router';
import { Icon, type IconName } from './Icon';

export type Tab = 'planet' | 'countries' | 'trips' | 'feed' | 'me';
const TABS: ReadonlyArray<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'planet', label: 'Планета', icon: 'planet' },
  { id: 'countries', label: 'Страны', icon: 'flagStack' },
  { id: 'trips', label: 'Поездки', icon: 'suitcase' },
  { id: 'feed', label: 'Лента', icon: 'news' },
  { id: 'me', label: 'Профиль', icon: 'user' },
];

/**
 * Tap on the open tab: a scrolled page goes back to the top; «Лента» already at the top opens the digest.
 * Otherwise the link does its usual job (e.g. from a trip back to the trips list).
 */
function retap(e: MouseEvent, tab: Tab): void {
  const page = document.querySelector<HTMLElement>('.tab-layer:not([hidden]) .screen');
  if (page && page.scrollTop > 8) {
    e.preventDefault();
    page.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (tab === 'feed') {
    e.preventDefault();
    go('feed/digest', true);
  }
}

/** Floating glass bar: icons only; the active one grows into a lime pill with its label. */
export function SoftBar({ current }: { current: Tab }) {
  return (
    <nav className="softbar" aria-label="Разделы">
      {TABS.map((t) => {
        const on = current === t.id;
        return (
          <a key={t.id} href={`#/${t.id}`} aria-current={on ? 'page' : undefined} aria-label={t.label} className={on ? 'on' : ''} onClick={on ? (e) => retap(e, t.id) : undefined}>
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
