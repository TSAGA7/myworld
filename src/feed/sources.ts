/**
 * ИСТОЧНИКИ ЛЕНТЫ — править только этот список.
 *
 * Раздел → тип источника → список { name, url }.
 *   • Telegram-канал: url = 'https://t.me/<канал>' (читается через публичный предпросмотр t.me/s, без ключей)
 *   • Сайт: url = адрес RSS-ленты; `only` — оставить только записи, где в рубрике/ссылке/тексте есть эти слова
 *   • Сайт и его Telegram-канал вместе не добавляем: берём то, что отдаёт больше новостей (Турдом — RSS, АТОР — Telegram)
 * Проверить новый канал без публикации: GitHub → Actions → «Лента — новости и цены» → Run workflow → поле «Проверить источники».
 * Только первоисточники: агрегаторы и сервисы-перепостеры (Самокатус, Aviasales и т. п.) сюда не добавляем.
 * Источник, который перестал отвечать, просто не даёт новостей (в news.json у него ok=false).
 */
export const SOURCE_LIST = {
  Авиа: {
    Авиакомпании: [
      { name: 'Аэрофлот', url: 'https://t.me/aeroflot_official' },
      { name: 'Победа', url: 'https://t.me/PobedaAirlines' },
      { name: 'S7 Airlines', url: 'https://t.me/s7newsroom' },
      { name: 'Azur Air', url: 'https://t.me/azurair_pressroom' },
      { name: 'Уральские авиалинии', url: 'https://t.me/uralairlines' },
      { name: 'Utair', url: 'https://t.me/utair' },
      { name: 'Smartavia', url: 'https://t.me/flysmartavia' },
      { name: 'Белавиа', url: 'https://t.me/belavia_official' },
    ],
    Аэропорты: [{ name: 'Аэропорт Казань', url: 'https://t.me/airportkazan' }],
    'Тревел-каналы': [
      { name: 'Frequent Flyers', url: 'https://t.me/frequentflyers' },
      { name: 'Loyalty Shmoyalty', url: 'https://t.me/loyaltyshmoyalty' },
    ],
  },
  'Ж/Д': {
    Перевозчики: [
      { name: 'Телеграмма РЖД', url: 'https://t.me/telerzd' },
      { name: 'Гранд Сервис Экспресс (Таврия)', url: 'https://t.me/tavria_train' },
    ],
  },
  Остальное: {
    СМИ: [
      { name: 'АТОР', url: 'https://t.me/atorus' },
      { name: 'Турдом', url: 'https://www.tourdom.ru/rss/' },
      { name: 'ТАСС', url: 'https://tass.ru/rss/v2.xml', only: ['Туризм и отдых'] },
    ],
    'Тревел-каналы': [
      { name: 'Ну чё, народ, погнали?!', url: 'https://t.me/ranarod' },
      { name: 'Типичный визовик', url: 'https://t.me/tipical_vizovik' },
      { name: 'Улетет', url: 'https://t.me/uletet_1' },
    ],
    // Отели, курорты, туристические офисы стран. Проверены и не подошли (нет постов с 2020–2025 или канал не официальный):
    // Роза Хутор, Красная Поляна, Шерегеш, Cosmos, Azimut, Мостуризм, RUSSPASS, Go Türkiye, Visit Dubai.
    Отели: [],
    Курорты: [],
    Представительства: [],
  },
} satisfies Record<string, Record<string, ReadonlyArray<{ name: string; url: string; only?: readonly string[] }>>>;

export type Section = keyof typeof SOURCE_LIST;

export interface SourceDef {
  id: string;
  name: string;
  kind: 'telegram' | 'rss';
  /** Telegram channel name or RSS address. */
  ref: string;
  section: Section;
  group: string;
  only?: readonly string[];
}

const TG = /^https?:\/\/t\.me\/(?:s\/)?([A-Za-z0-9_]+)\/?$/;

/** The list above as flat records; ids are channel names or site hosts. */
export const SOURCES: readonly SourceDef[] = Object.entries(SOURCE_LIST).flatMap(([section, groups]) =>
  Object.entries(groups).flatMap(([group, list]) =>
    (list as ReadonlyArray<{ name: string; url: string; only?: readonly string[] }>).map((s): SourceDef => {
      const tg = s.url.match(TG);
      const ref = tg ? (tg[1] as string) : s.url;
      const id = tg ? ref.toLowerCase() : (new URL(s.url).hostname.replace(/^www\./, '').split('.')[0] as string);
      return { id, name: s.name, kind: tg ? 'telegram' : 'rss', ref, section: section as Section, group, ...(s.only ? { only: s.only } : {}) };
    }),
  ),
);

export const sourceUrl = (s: SourceDef): string => (s.kind === 'telegram' ? `https://t.me/s/${s.ref}` : s.ref);
