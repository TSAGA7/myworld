import { useFeedFile } from '../../feed/client';
import { dayMonthFull } from '../../feed/format';
import type { Edition } from '../../feed/schema';
import { Empty, Flag } from '../../ui/kit';
import { Loading, SourceLinks } from './common';

/** «Интересное»: morning and evening picks from author channels, every item credited and linked. */
export function InterestingView() {
  const state = useFeedFile('interesting');
  const editions = state.data?.editions ?? [];
  if (!editions.length) {
    if (state.status === 'loading') return <Loading />;
    const offline = state.status === 'offline';
    return (
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
    );
  }
  return (
    <>
      {editions.slice(0, 8).map((e) => (
        <EditionCard key={e.id} edition={e} />
      ))}
      <p className="faint tiny feed-sources">Пересказываем коротко — подробности, фото и видео у авторов по ссылкам.</p>
    </>
  );
}

function EditionCard({ edition }: { edition: Edition }) {
  return (
    <section className="card story-edition">
      <h3 className="digest-block-title">
        <span aria-hidden="true">{edition.part === 'morning' ? '☕️' : '🌙'}</span> {edition.part === 'morning' ? 'Утро' : 'Вечер'}, {dayMonthFull(edition.date)}
      </h3>
      {edition.items.map((s) => (
        <article key={s.storyIds.join()} className="story-item">
          <p>
            {s.country && <Flag id={s.country} size="sm" />}
            <b>{s.place}</b>: {s.text}
          </p>
          <SourceLinks links={s.links} />
        </article>
      ))}
    </section>
  );
}
