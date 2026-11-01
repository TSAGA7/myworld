import { useState } from 'react';
import { go } from '../../app/router';
import { useToday } from '../../app/world';
import { useFeedFile } from '../../feed/client';
import { dayMonthFull } from '../../feed/format';
import type { Digest, DigestEntry } from '../../feed/schema';
import { plural } from '../../domain/dates';
import { Empty } from '../../ui/kit';
import { Loading, mskTime, SourceLinks } from './common';

/** Daily digest: a summary block, then «Главное» and «Остальное» as separate blocks. */
export function DigestView() {
  const state = useFeedFile('digest');
  const today = useToday();
  const digests = state.data?.digests ?? [];
  const [date, setDate] = useState<string | null>(null);
  const d = digests.find((x) => x.date === date) ?? digests[0];

  if (!d) {
    if (state.status === 'loading') return <Loading />;
    const offline = state.status === 'offline';
    return (
      <Empty
        icon="sparkle"
        title={offline ? 'Нет связи' : 'Первый дайджест появится вечером'}
        text={offline ? 'Дайджест загрузится, когда появится интернет.' : 'Каждый вечер — главное из тревел-каналов и СМИ за сутки, со ссылками на источники.'}
        action={
          <button type="button" className={offline ? 'btn dark' : 'btn glass-btn'} onClick={offline ? state.reload : () => go('feed/news', true)}>
            {offline ? 'Повторить' : 'Пока читать новости'}
          </button>
        }
      />
    );
  }

  return (
    <>
      {digests.length > 1 && (
        <div className="chips" role="group" aria-label="День">
          {digests.map((x) => (
            <button key={x.date} type="button" className="chip" aria-pressed={x.date === d.date} onClick={() => setDate(x.date)}>
              {x.date === today ? 'Сегодня' : dayMonthFull(x.date)}
            </button>
          ))}
        </div>
      )}
      <DigestSummary d={d} />
      <DigestBlock title="Главное" icon="🔥" entries={d.main} numbered />
      {d.other.length > 0 && <DigestBlock title="Остальное" icon="🗂" entries={d.other} />}
    </>
  );
}

function DigestSummary({ d }: { d: Digest }) {
  const total = d.main.length + d.other.length;
  return (
    <section className="digest-hero" aria-label="Сводка дня">
      <div className="digest-hero-top">
        <span className="digest-date">
          <b className="num">{Number(d.date.slice(8, 10))}</b>
          <span>{dayMonthFull(d.date).split(' ')[1]}</span>
        </span>
        <span className="pill digest-time">обновлено {mskTime(d.createdAt)} МСК</span>
      </div>
      <h2 className="h2">Дайджест дня</h2>
      <p className="digest-lead">{d.lead}</p>
      <div className="digest-stats">
        <span>
          <b className="num">{total}</b> {plural(total, 'новость', 'новости', 'новостей')}
        </span>
        <span>
          <b className="num">{d.main.length}</b> {plural(d.main.length, 'главная', 'главных', 'главных')}
        </span>
        <span>
          <b className="num">{d.sourcesCount}</b> {plural(d.sourcesCount, 'источник', 'источника', 'источников')}
        </span>
      </div>
    </section>
  );
}

function DigestBlock({ title, icon, entries, numbered = false }: { title: string; icon: string; entries: DigestEntry[]; numbered?: boolean }) {
  return (
    <section className="card digest-block">
      <h3 className="digest-block-title">
        <span aria-hidden="true">{icon}</span> {title}
      </h3>
      {entries.map((e, i) => (
        <article key={e.title} className="digest-item">
          {numbered && <span className="digest-num num">{i + 1}</span>}
          <div className="digest-body">
            <b>{e.title}</b>
            <p>{e.text}</p>
            <SourceLinks links={e.links} />
          </div>
        </article>
      ))}
    </section>
  );
}
