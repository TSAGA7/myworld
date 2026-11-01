import { SOURCE_LIST, STORY_LIST } from '../feed/sources';
import { Sheet } from '../ui/kit';

type Entry = { name: string; url: string; lang?: 'en' };
const link = (e: Entry) => (e.url.startsWith('https://t.me/') ? e.url : new URL(e.url).origin);

function Links({ list }: { list: readonly Entry[] }) {
  return (
    <p className="sources-line">
      {list.map((e, i) => (
        <span key={e.url}>
          {i > 0 && ', '}
          <a href={link(e)} target="_blank" rel="noopener noreferrer">
            {e.name}
          </a>
          {e.lang === 'en' && <span className="faint"> (в переводе)</span>}
        </span>
      ))}
    </p>
  );
}

/** Every data source of the app in one place: map data, news, «Интересное», ticket prices. */
export function SourcesSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Источники" onClose={onClose}>
      <div className="sources-sheet">
        <section>
          <h3 className="h3">Карта и справочники</h3>
          <p className="sources-line">
            Границы стран и регионов, столицы — Natural Earth (общественное достояние). Справочник городов — GeoNames (CC BY 4.0). Аэропорты — OurAirports (общественное достояние). Подробная подложка —
            OpenFreeMap, OpenMapTiles, © участники OpenStreetMap. Флаги — flag-icons (MIT). Шрифт Onest (SIL OFL). Число стран зависит от выбранного способа подсчёта.
          </p>
        </section>
        <section>
          <h3 className="h3">Лента: новости и дайджест</h3>
          {Object.entries(SOURCE_LIST).map(([section, groups]) =>
            Object.entries(groups)
              .filter(([, list]) => list.length > 0)
              .map(([group, list]) => (
                <div key={`${section}-${group}`} className="sources-group">
                  <span className="faint small">
                    {section} · {group}
                  </span>
                  <Links list={list} />
                </div>
              )),
          )}
          <p className="faint small sources-note">В ленте — начало поста, полный текст у автора по ссылке. Дайджест и переводы пересказывают новости своими словами со ссылками на источники.</p>
        </section>
        <section>
          <h3 className="h3">Интересное</h3>
          <Links list={STORY_LIST} />
        </section>
        <section>
          <h3 className="h3">Билеты</h3>
          <p className="sources-line">
            Цены — Aviasales через{' '}
            <a href="https://www.travelpayouts.com/" target="_blank" rel="noopener noreferrer">
              Travelpayouts
            </a>
            : самые дешёвые билеты, найденные пользователями за последние двое суток.
          </p>
        </section>
      </div>
    </Sheet>
  );
}
