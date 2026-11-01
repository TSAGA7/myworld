/**
 * ИСТОЧНИКИ ЛЕНТЫ — править только этот список.
 *
 * Раздел → тип источника → список { name, url }.
 *   • Telegram-канал: url = 'https://t.me/<канал>' (читается через публичный предпросмотр t.me/s, без ключей)
 *   • Сайт: url = адрес RSS-ленты; `only` — оставить только записи, где в рубрике/ссылке/тексте есть эти слова
 *   • Зарубежный источник: lang: 'en' — новость появится в ленте после перевода (его делает Claude утром и вечером)
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
    СМИ: [
      { name: 'Авиаторщина', url: 'https://t.me/aviatorshina' },
      { name: 'Simple Flying', url: 'https://simpleflying.com/feed/', lang: 'en' },
      { name: 'One Mile at a Time', url: 'https://onemileatatime.com/feed/', lang: 'en' },
    ],
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
      { name: 'Турпром', url: 'https://t.me/tourprom' },
      { name: 'Euronews Travel', url: 'https://www.euronews.com/rss?level=vertical&name=travel', lang: 'en' },
    ],
    'Тревел-каналы': [
      { name: 'Ну чё, народ, погнали?!', url: 'https://t.me/ranarod' },
      { name: 'Типичный визовик', url: 'https://t.me/tipical_vizovik' },
      { name: 'Улетет', url: 'https://t.me/uletet_1' },
    ],
    // Не добавлены: Travel News (@travelnews24) — пересказывает чужие новости (те же, что у АТОР);
    // Самокатус, Aviasales, Travelhacks — агрегаторы.
    // Отели, курорты, туристические офисы стран. Проверены и не подошли (нет постов с 2020–2025 или канал не официальный):
    // Роза Хутор, Красная Поляна, Шерегеш, Cosmos, Azimut, Мостуризм, RUSSPASS, Go Türkiye, Visit Dubai.
    Отели: [],
    Курорты: [],
    Представительства: [],
  },
} satisfies Record<string, Record<string, readonly SourceEntry[]>>;

/**
 * «Интересное»: авторские каналы о путешествиях. Отсюда утром и вечером Claude выбирает истории и советы
 * и пишет короткую подборку со ссылкой на автора.
 */
export const STORY_LIST: readonly SourceEntry[] = [
  { name: 'Рутрэвел', url: 'https://t.me/rutravellers' },
  { name: 'Грушины Юра и Юля', url: 'https://t.me/grushiny' },
  { name: 'SHICHKOFF', url: 'https://t.me/shichk0ff' },
  { name: 'Врен о Японии', url: 'https://t.me/wrenjapan' },
];

type SourceEntry = { name: string; url: string; only?: readonly string[]; lang?: 'en' };
export type Section = keyof typeof SOURCE_LIST | 'Интересное';

export interface SourceDef {
  id: string;
  name: string;
  kind: 'telegram' | 'rss';
  /** Telegram channel name or RSS address. */
  ref: string;
  section: Section;
  group: string;
  only?: readonly string[];
  lang?: 'en';
}

const TG = /^https?:\/\/t\.me\/(?:s\/)?([A-Za-z0-9_]+)\/?$/;

/** The list above as flat records; ids are channel names or site hosts. */
function toDef(s: SourceEntry, section: Section, group: string): SourceDef {
  const tg = s.url.match(TG);
  const ref = tg ? (tg[1] as string) : s.url;
  const id = tg ? ref.toLowerCase() : (new URL(s.url).hostname.replace(/^www\./, '').split('.')[0] as string);
  return { id, name: s.name, kind: tg ? 'telegram' : 'rss', ref, section, group, ...(s.only ? { only: s.only } : {}), ...(s.lang ? { lang: s.lang } : {}) };
}

/** The news list above as flat records; ids are channel names or site hosts. */
export const SOURCES: readonly SourceDef[] = Object.entries(SOURCE_LIST).flatMap(([section, groups]) =>
  Object.entries(groups).flatMap(([group, list]) => (list as readonly SourceEntry[]).map((s) => toDef(s, section as Section, group))),
);
/** Authors of «Интересное». */
export const STORY_SOURCES: readonly SourceDef[] = STORY_LIST.map((s) => toDef(s, 'Интересное', 'Авторы'));

export const sourceUrl = (s: SourceDef): string => (s.kind === 'telegram' ? `https://t.me/s/${s.ref}` : s.ref);
