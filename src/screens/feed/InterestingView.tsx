import { useState } from 'react';
import { setSetting, useWorld, type Settings } from '../../app/world';
import { useFeedFile } from '../../feed/client';
import { dayMonthFull, greeting } from '../../feed/format';
import type { Edition, StoryItem } from '../../feed/schema';
import { Icon } from '../../ui/Icon';
import { Empty, Flag, Segmented, Sheet } from '../../ui/kit';
import { Loading, PostImage, SourceLinks, useNow } from './common';

const PHOTO_OPTIONS: ReadonlyArray<{ value: Settings['storiesPhoto']; label: string }> = [
  { value: 'above', label: 'Фото сверху' },
  { value: 'below', label: 'Фото снизу' },
  { value: 'none', label: 'Без фото' },
];

/** «Интересное»: morning and evening picks from author channels, every item credited and linked. */
export function InterestingView() {
  const state = useFeedFile('interesting');
  const { settings } = useWorld();
  const now = useNow();
  const [setup, setSetup] = useState(false);
  const editions = state.data?.editions ?? [];

  const head = (
    <header className="stories-hello">
      <div className="grow">
        <h2 className="h2">{greeting(now.getHours())}, дорогой путешественник!</h2>
        <p className="muted">Вот что мы для тебя подготовили</p>
      </div>
      <button type="button" className="circle-btn sm" onClick={() => setSetup(true)} aria-label="Вид подборки">
        <Icon name="settings" size={18} />
      </button>
      {setup && <StoriesSetup onClose={() => setSetup(false)} />}
    </header>
  );

  if (!editions.length) {
    if (state.status === 'loading') return <Loading />;
    const offline = state.status === 'offline';
    return (
      <>
        {head}
        <Empty
          icon="book"
          title={offline ? 'Нет связи' : 'Первая подборка появится скоро'}
          text={offline ? 'Подборка загрузится, когда появится интернет.' : 'Утром и вечером — истории, советы и находки из авторских тревел-каналов, со ссылкой на автора.'}
          action={
            offline ? (
              <button type="button" className="btn dark" onClick={state.reload}>
                Повторить
              </button>
            ) : undefined
          }
        />
      </>
    );
  }
  return (
    <>
      {head}
      {editions.slice(0, 8).map((e) => (
        <Edition key={e.id} edition={e} photo={settings.storiesPhoto} cards={settings.storiesCards} />
      ))}
      <p className="faint tiny feed-sources">Пересказываем коротко — подробности, фото и видео у авторов по ссылкам.</p>
    </>
  );
}

function StoriesSetup({ onClose }: { onClose: () => void }) {
  const { settings } = useWorld();
  return (
    <Sheet title="Вид подборки" onClose={onClose}>
      <div className="stack">
        <Segmented label="Фото" value={settings.storiesPhoto} options={PHOTO_OPTIONS} onChange={(v) => void setSetting('storiesPhoto', v)} />
        <div className="list">
          <label className="list-row tap">
            <span className="grow">
              <span className="t">Каждая история — отдельный блок</span>
              <span className="s block">Как в новостях: карточка на историю вместо общей подборки.</span>
            </span>
            <input type="checkbox" className="switch" checked={settings.storiesCards} onChange={(e) => void setSetting('storiesCards', e.target.checked)} />
          </label>
        </div>
      </div>
    </Sheet>
  );
}

function Edition({ edition, photo, cards }: { edition: Edition; photo: Settings['storiesPhoto']; cards: boolean }) {
  const title = (
    <h3 className="stories-date">
      <span aria-hidden="true">{edition.part === 'morning' ? '☕️' : '🌙'}</span> {edition.part === 'morning' ? 'Утро' : 'Вечер'} · {dayMonthFull(edition.date)}
    </h3>
  );
  const items = edition.items.map((s) => <Story key={s.storyIds.join()} story={s} photo={photo} card={cards} />);
  if (cards)
    return (
      <section className="stories-cards">
        {title}
        {items}
      </section>
    );
  return (
    <section className="card story-edition">
      {title}
      {items}
    </section>
  );
}

function Story({ story, photo, card }: { story: StoryItem; photo: Settings['storiesPhoto']; card: boolean }) {
  const img = photo !== 'none' && story.image ? <PostImage src={story.image} /> : null;
  return (
    <article className={card ? 'card tight story-card' : 'story-item'}>
      {photo === 'above' && img}
      <p>
        {story.country && <Flag id={story.country} size="sm" />}
        <b>{story.place}</b>: {story.text}
      </p>
      {photo === 'below' && img}
      <SourceLinks links={story.links} />
    </article>
  );
}
