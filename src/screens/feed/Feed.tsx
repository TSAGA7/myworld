import { useRef } from 'react';
import { refreshFeed } from '../../feed/client';
import { usePullToRefresh } from '../../ui/usePullToRefresh';
import { useSwipe } from '../../ui/useSwipe';
import { go } from '../../app/router';
import { Segmented, Topo } from '../../ui/kit';
import { DealsView } from './DealsView';
import { PullBanner } from './common';
import { DigestView } from './DigestView';
import { InterestingView } from './InterestingView';
import { NewsView } from './NewsView';

type Sub = 'digest' | 'news' | 'deals' | 'stories';
const SUBS: ReadonlyArray<{ value: Sub; label: string }> = [
  { value: 'deals', label: 'Билеты' },
  { value: 'stories', label: 'Интересное' },
  { value: 'digest', label: 'Дайджест' },
  { value: 'news', label: 'Новости' },
];

/** Horizontal swipe that is not a scroll of chips, a sheet or a text field. */

export function Feed({ route }: { route: string[] }) {
  const sub: Sub = SUBS.some((s) => s.value === route[1]) ? (route[1] as Sub) : 'deals';
  const index = SUBS.findIndex((s) => s.value === sub);
  const from = useRef(index);
  const dir = index >= from.current ? 'next' : 'prev';
  from.current = index;
  const swipe = useSwipe((d) => {
    const next = SUBS[index + d];
    if (next) go(`feed/${next.value}`, true);
  });

  const screen = useRef<HTMLDivElement>(null);
  const pull = usePullToRefresh(screen, refreshFeed);

  return (
    <div ref={screen} className="screen feed-screen swipeable" {...swipe}>
      <Topo />
      <div className={`ptr ${pull.armed ? 'armed' : ''} ${pull.refreshing ? 'busy' : ''}`} style={{ height: pull.y, transition: pull.dragging ? 'none' : undefined }} aria-hidden={!pull.y}>
        {pull.y > 0 && (pull.refreshing ? <span className="spinner sm" aria-label="Обновляем" /> : <span className="ptr-arrow">↓</span>)}
        {pull.y > 0 && !pull.refreshing && <span className="ptr-text">{pull.armed ? 'Отпустите, чтобы обновить' : 'Потяните, чтобы обновить'}</span>}
      </div>
      <div className="screen-inner" style={{ transform: pull.y ? `translateY(${pull.y}px)` : undefined, transition: pull.dragging ? 'none' : 'transform 0.25s' }}>
        <header className="row between">
          <h1 className="h1">
            <span className="thin">Тревел-</span>лента
          </h1>
        </header>
        <Segmented label="Раздел ленты" value={sub} options={SUBS} onChange={(v) => go(`feed/${v}`, true)} className="feed-tabs" />
        <PullBanner />
        <div key={sub} className={`feed-page ${dir}`}>
          {sub === 'digest' ? <DigestView /> : sub === 'news' ? <NewsView /> : sub === 'deals' ? <DealsView /> : <InterestingView />}
        </div>
      </div>
    </div>
  );
}
