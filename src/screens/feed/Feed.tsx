import { useRef, type TouchEvent } from 'react';
import { go } from '../../app/router';
import { Segmented, Topo } from '../../ui/kit';
import { DealsView } from './DealsView';
import { DigestView } from './DigestView';
import { InterestingView } from './InterestingView';
import { NewsView } from './NewsView';

type Sub = 'digest' | 'news' | 'deals' | 'stories';
const SUBS: ReadonlyArray<{ value: Sub; label: string }> = [
  { value: 'digest', label: 'Дайджест' },
  { value: 'news', label: 'Новости' },
  { value: 'deals', label: 'Билеты' },
  { value: 'stories', label: 'Интересное' },
];

/** Horizontal swipe that is not a scroll of chips, a sheet or a text field. */
const ignoreSwipe = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest('.chips, .sheet, .scrim, input, textarea, select, [data-noswipe]');

export function Feed({ route }: { route: string[] }) {
  const sub: Sub = SUBS.some((s) => s.value === route[1]) ? (route[1] as Sub) : 'digest';
  const index = SUBS.findIndex((s) => s.value === sub);
  const from = useRef(index);
  const dir = index >= from.current ? 'next' : 'prev';
  from.current = index;
  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  const onStart = (e: TouchEvent) => {
    const p = e.touches[0];
    start.current = p && e.touches.length === 1 && !ignoreSwipe(e.target) ? { x: p.clientX, y: p.clientY, t: Date.now() } : null;
  };
  const onEnd = (e: TouchEvent) => {
    const s = start.current;
    const p = e.changedTouches[0];
    start.current = null;
    if (!s || !p) return;
    const dx = p.clientX - s.x;
    const dy = p.clientY - s.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.8 || Date.now() - s.t > 800) return;
    const next = SUBS[index + (dx < 0 ? 1 : -1)];
    if (next) go(`feed/${next.value}`, true);
  };

  return (
    <div className="screen feed-screen" onTouchStart={onStart} onTouchEnd={onEnd}>
      <Topo />
      <div className="screen-inner">
        <header className="row between">
          <h1 className="h1">
            <span className="thin">Тревел-</span>лента
          </h1>
        </header>
        <Segmented label="Раздел ленты" value={sub} options={SUBS} onChange={(v) => go(`feed/${v}`, true)} className="feed-tabs" />
        <div key={sub} className={`feed-page ${dir}`}>
          {sub === 'digest' ? <DigestView /> : sub === 'news' ? <NewsView /> : sub === 'deals' ? <DealsView /> : <InterestingView />}
        </div>
      </div>
    </div>
  );
}
