import { describe, expect, it } from 'vitest';
import { aviasalesLink, findDeals, median, monthsFrom, recordPrices, routeKey, type Names, type PriceHistory, type PriceRow } from './deals';
import { addDigest, buildDigest, DraftSchema, moscowDate } from './digest';
import { mergeNews, recentNews, toItem } from './news';
import { parseFeed, parseTelegram } from './parse';
import type { NewsItem } from './schema';
import { dedupe, htmlToText, splitPost, tagsOf } from './text';

const TG = `
<meta property="og:title" content="Самокатус">
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="samokatus/101">
 <div class="tgme_widget_message_reply"><div class="tgme_widget_message_metatext js-message_reply_text">Ответ на старый пост</div></div>
 <a class="tgme_widget_message_photo_wrap blured" style="width:800px;background-image:url('https://cdn4.telesco.pe/file/abc.jpg')"></a>
 <div class="tgme_widget_message_text js-message_text" dir="auto"><b>S7 Airlines</b> запустила прямые рейсы из Новосибирска в Мале.<br/>Полеты дважды в неделю на A320 &amp; с посадкой в Термезе.</div>
 <a class="tgme_widget_message_date" href="https://t.me/samokatus/101"><time datetime="2026-10-30T09:15:00+00:00" class="time">12:15</time></a>
</div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="samokatus/102">
 <div class="tgme_widget_message_photo_wrap" style="background-image:url('x')"></div>
 <a class="tgme_widget_message_date"><time datetime="2026-10-30T10:00:00+00:00">13:00</time></a>
</div></div>
<div class="tgme_widget_message_wrap js-widget_message_wrap"><div class="tgme_widget_message js-widget_message" data-post="other/5">
 <div class="tgme_widget_message_text js-message_text">Пересланный пост другого канала с текстом</div><time datetime="2026-10-30T10:00:00+00:00"></time>
</div></div>`;

describe('parsing', () => {
  it('reads text posts of the channel from the t.me/s preview', () => {
    const r = parseTelegram(TG, 'samokatus');
    expect(r.title).toBe('Самокатус');
    expect(r.posts).toHaveLength(1);
    expect(r.posts[0]).toMatchObject({ id: '101', url: 'https://t.me/samokatus/101', at: '2026-10-30T09:15:00.000Z', image: 'https://cdn4.telesco.pe/file/abc.jpg' });
    expect(r.posts[0]?.text).toBe('S7 Airlines запустила прямые рейсы из Новосибирска в Мале.\nПолеты дважды в неделю на A320 & с посадкой в Термезе.');
  });

  it('reads RSS and Atom', () => {
    const rss = `<rss><channel><title>Турдом</title><item><title><![CDATA[Грузия отменила сбор]]></title><link>https://t.ru/a</link><enclosure url="https://t.ru/a.jpg" type="image/jpeg"/><pubDate>Sat, 31 Oct 2026 08:00:00 +0300</pubDate><description>&lt;p&gt;Подробности ниже&lt;/p&gt;</description></item></channel></rss>`;
    const r = parseFeed(rss);
    expect(r.title).toBe('Турдом');
    expect(r.posts[0]).toMatchObject({ image: 'https://t.ru/a.jpg', url: 'https://t.ru/a', at: '2026-10-31T05:00:00.000Z', text: 'Грузия отменила сбор\nПодробности ниже' });
    const atom = `<feed><title>X</title><entry><title>Новость дня про визы</title><link href="https://x.ru/1"/><updated>2026-10-31T10:00:00Z</updated><summary>Текст</summary></entry></feed>`;
    expect(parseFeed(atom).posts[0]).toMatchObject({ url: 'https://x.ru/1', text: 'Новость дня про визы\nТекст' });
  });

  it('cleans html and splits a post into a title and an excerpt', () => {
    expect(htmlToText('a<br>b &laquo;c&raquo;&#33;')).toBe('a\nb «c»!');
    const p = splitPost('#новости\nSaudia с 1 декабря возобновит рейсы из Джидды в Москву.\nТри раза в неделю.\n@samokatus');
    expect(p).toEqual({ title: 'Saudia с 1 декабря возобновит рейсы из Джидды в Москву.', text: 'Три раза в неделю.' });
    const long = splitPost(`Власти Венеции утвердили даты платного въезда. ${'Очень длинный текст '.repeat(20)}`);
    expect(long.title).toBe('Власти Венеции утвердили даты платного въезда.');
    expect(long.text.endsWith('…')).toBe(true);
  });

  it('tags news by topic', () => {
    expect(tagsOf('«Победа» объявила распродажу со скидкой 10% на рейсы в Турцию')).toEqual(['deal', 'air']);
    expect(tagsOf('Индия отменила безвиз для граждан')).toEqual(['visa']);
    expect(tagsOf('РЖД пустит новые поезда «Ласточка»')).toEqual(['rail']);
    expect(tagsOf('Массовые акции протеста могут осложнить путешествия')).toEqual([]);
    expect(tagsOf('Билеты на ж/д до Казани')).toEqual(['rail']);
    expect(tagsOf('Победа над жадностью: между делом')).toEqual([]);
  });
});

const item = (sourceId: string, id: string, at: string, title: string, text = ''): NewsItem => ({ id: `${sourceId}:${id}`, sourceId, url: `https://t.me/${sourceId}/${id}`, at, title, text, tags: [], also: [] });

describe('news', () => {
  it('merges retellings of one story into the earliest post', () => {
    const a = item('atorus', '1', '2026-10-31T08:00:00Z', 'Saudia с 1 декабря возобновит прямые рейсы из Джидды в Москву', 'Перевозчик будет летать три раза в неделю на Boeing 787');
    const b = item('samokatus', '2', '2026-10-31T09:00:00Z', 'Saudia возобновит прямые рейсы Джидда — Москва с 1 декабря', 'три раза в неделю, Boeing 787 Dreamliner');
    const c = item('aviasales', '3', '2026-10-31T09:30:00Z', 'Победа объявила распродажу билетов в Турцию по промокоду', 'Скидка десять процентов до первого ноября');
    const out = dedupe([c, b, a]);
    expect(out.map((x) => x.id)).toEqual(['aviasales:3', 'atorus:1']);
    expect(out[1]?.also).toEqual([{ sourceId: 'samokatus', url: 'https://t.me/samokatus/2' }]);
  });

  it('keeps 72 hours, does not bring back merged twins and updates edited posts', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const old = item('atorus', '0', '2026-10-28T09:00:00Z', 'Старая новость про отели Сочи и цены на сезон');
    const kept = { ...item('atorus', '1', '2026-10-31T08:00:00Z', 'Saudia возобновит рейсы в Москву с декабря и мы рады'), also: [{ sourceId: 'samokatus', url: 'https://t.me/samokatus/2' }] };
    const twin = item('samokatus', '2', '2026-10-31T09:00:00Z', 'Совсем другой текст, но это тот же пост из also');
    const edited = { ...kept, title: 'Saudia возобновит рейсы в Москву с 1 декабря и мы рады' };
    const out = mergeNews([old, kept], [twin, edited], now);
    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe(edited.title);
    expect(out[0]?.also).toHaveLength(1);
    expect(recentNews(out, now, 36).length).toBe(1);
    expect(recentNews(out, now).length).toBe(0);
  });

  it('turns a raw post into an item and skips tiny ones', () => {
    expect(toItem('x', { id: '1', url: 'u', at: 'a', text: 'Ок' })).toBeNull();
    expect(toItem('x', { id: '1', url: 'u', at: 'a', text: 'Индия отменила безвиз для туристов из России' })?.tags).toEqual(['visa']);
  });
});

const names: Names = {
  city: (c) => ({ MOW: { name: 'Москва', country: 'RU' }, BJS: { name: 'Пекин', country: 'CN' }, IST: { name: 'Стамбул', country: 'TR' } })[c],
  airline: (c) => ({ S7: 'S7 Airlines' })[c],
};
const row = (destination: string, price: number, month: string, day = '10'): PriceRow => ({ origin: 'MOW', destination, price, departure_at: `${month}-${day}T10:00:00+03:00`, airline: 'S7', transfers: 1, duration: 600, link: `/search/MOW${day}12${destination}1?t=x` });

describe('deals', () => {
  const now = new Date('2026-11-01T07:00:00Z');

  it('helpers', () => {
    expect(monthsFrom(now, 3)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(aviasalesLink('/search/MOW1012BJS1?t=1', 'm1', 'MOW', 'BJS', '2026-12-10')).toBe('https://www.aviasales.ru/search/MOW1012BJS1?t=1&marker=m1');
    expect(aviasalesLink(undefined, '', 'MOW', 'BJS', '2026-12-10T10:00:00+03:00')).toBe('https://www.aviasales.ru/search/MOW1012BJS1');
  });

  it('finds a price far below the usual one by history of previous days', () => {
    const r = row('BJS', 13900, '2026-12');
    const today = Math.floor(now.getTime() / 86400e3);
    const history: PriceHistory = { [routeKey(r)]: [1, 2, 3, 4, 5, 6].map((i) => [today - i, 30000 + i * 100]) };
    const deals = findDeals([r, row('IST', 9000, '2026-12')], history, now, [], names, 'm');
    expect(deals).toHaveLength(1);
    expect(deals[0]).toMatchObject({ id: 'MOW-BJS-2026-12-10', destinationName: 'Пекин', countryCode: 'CN', price: 13900, usual: 30350, discount: 54, airline: 'S7 Airlines', foundAt: now.toISOString() });
    // Same price an hour later keeps the moment it was found.
    const later = new Date(now.getTime() + 3600e3);
    expect(findDeals([r], history, later, deals, names, 'm')[0]?.foundAt).toBe(now.toISOString());
  });

  it('without history compares with the same route in other months', () => {
    const rows = [row('IST', 8000, '2026-11', '20'), row('IST', 21000, '2026-12'), row('IST', 22000, '2027-01'), row('IST', 20000, '2027-02'), row('IST', 23000, '2027-03')];
    const deals = findDeals(rows, {}, now, [], names, '');
    expect(deals.map((d) => [d.id, d.discount])).toEqual([['MOW-IST-2026-11-20', 62]]);
    // Not enough months → no guess.
    expect(findDeals(rows.slice(0, 3), {}, now, [], names, '')).toEqual([]);
  });

  it('ignores small savings and past departures', () => {
    const rows = [row('IST', 2000, '2026-12'), row('IST', 3500, '2027-01'), row('IST', 3600, '2027-02'), row('IST', 3700, '2027-03')];
    expect(findDeals(rows, {}, now, [], names, '')).toEqual([]);
    const past = { ...row('BJS', 1000, '2026-11'), departure_at: '2026-11-01T05:00:00Z' };
    expect(findDeals([past, row('BJS', 30000, '2026-12'), row('BJS', 30000, '2027-01'), row('BJS', 30000, '2027-02')], {}, now, [], names, '')).toEqual([]);
  });

  it('records one cheapest price per day and forgets old data', () => {
    const today = Math.floor(now.getTime() / 86400e3);
    const h = recordPrices({ 'MOW-BJS-2026-10': [[today - 3, 1]], 'MOW-BJS-2026-12': [[today - 60, 1], [today - 1, 20000]] }, [row('BJS', 15000, '2026-12'), row('BJS', 14000, '2026-12', '20')], now);
    expect(h).toEqual({ 'MOW-BJS-2026-12': [[today - 1, 20000], [today, 14000]] });
  });
});

describe('digest', () => {
  const news = [
    { ...item('atorus', '1', '2026-10-31T08:00:00Z', 'Индия отменила безвиз'), also: [{ sourceId: 'samokatus', url: 'https://t.me/samokatus/9' }] },
    item('aviasales', '2', '2026-10-31T09:00:00Z', 'Сбои в аэропортах Москвы'),
  ];
  const sources = [
    { id: 'atorus', name: 'АТОР', kind: 'telegram' as const, url: '', ok: true },
    { id: 'samokatus', name: 'Самокатус', kind: 'telegram' as const, url: '', ok: true },
    { id: 'aviasales', name: 'Aviasales', kind: 'telegram' as const, url: '', ok: true },
  ];
  const draft = DraftSchema.parse({
    lead: 'Отказ от безвиза с Индией и сбои в аэропортах',
    main: [{ title: 'Индия и безвиз', text: 'Индия отказалась от безвиза для россиян.', newsIds: ['atorus:1'] }],
    other: [{ title: 'Аэропорты Москвы', text: 'В аэропортах Москвы задержки рейсов.', newsIds: ['aviasales:2'] }],
  });

  it('attaches real links from news and counts sources', () => {
    const d = buildDigest(draft, news, sources, '2026-10-31', new Date('2026-10-31T18:00:00Z'));
    expect(d.main[0]?.links).toEqual([
      { name: 'АТОР', url: 'https://t.me/atorus/1' },
      { name: 'Самокатус', url: 'https://t.me/samokatus/9' },
    ]);
    expect(d.sourcesCount).toBe(3);
    // The Самокатус post was merged into the АТОР item: its id still resolves.
    const viaTwin = buildDigest({ ...draft, main: [{ ...draft.main[0]!, newsIds: ['samokatus:9'] }] }, news, sources, '2026-10-31', new Date());
    expect(viaTwin.main[0]?.links[0]?.url).toBe('https://t.me/atorus/1');
    expect(() => buildDigest({ ...draft, other: [{ title: 'Выдумка', text: 'Новость, которой нет.', newsIds: ['x:1'] }] }, news, sources, '2026-10-31', new Date())).toThrow();
  });

  it('keeps one digest per day, newest first, a week at most', () => {
    const d = (date: string) => buildDigest(draft, news, sources, date, new Date(`${date}T18:00:00Z`));
    let f = addDigest(null, d('2026-10-20'));
    for (let i = 21; i <= 31; i++) f = addDigest(f, d(`2026-10-${i}`));
    f = addDigest(f, { ...d('2026-10-31'), lead: 'Обновлённый вариант дайджеста' });
    expect(f.digests.map((x) => x.date)).toEqual(['2026-10-31', '2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27', '2026-10-26', '2026-10-25']);
    expect(f.digests[0]?.lead).toBe('Обновлённый вариант дайджеста');
  });

  it('dates the digest by Moscow time', () => {
    expect(moscowDate(new Date('2026-10-31T22:30:00Z'))).toBe('2026-11-01');
    expect(moscowDate(new Date('2026-10-31T20:30:00Z'))).toBe('2026-10-31');
  });
});

import { ago, dayMonth, dealsFrom, durationLabel, fromCity, greeting, liveVerdict, originForHome, rub, transfersLabel } from './format';

describe('format', () => {
  const now = new Date('2026-11-01T10:00:00Z');
  it('texts', () => {
    expect(rub(13900)).toBe('13\u00a0900\u00a0₽');
    expect(ago('2026-11-01T09:48:00Z', now)).toBe('12 мин назад');
    expect(ago('2026-11-01T06:00:00Z', now)).toBe('4 ч назад');
    expect(ago('2026-10-31T06:00:00Z', now)).toBe('вчера');
    expect(dayMonth('2026-12-21T10:00:00+03:00')).toBe('21 дек');
    expect(transfersLabel(0)).toBe('прямой');
    expect(transfersLabel(2)).toBe('2 пересадки');
    expect(durationLabel(605)).toBe('10 ч 5 мин');
    expect(fromCity('Санкт-Петербург')).toBe('из Петербурга');
    expect(fromCity('Казань')).toBe('из Казани');
    expect([4, 5, 11, 12, 16, 17, 22, 23].map(greeting)).toEqual(['Доброй ночи', 'Доброе утро', 'Доброе утро', 'Добрый день', 'Добрый день', 'Добрый вечер', 'Добрый вечер', 'Доброй ночи']);
  });
  it('picks the home departure city and judges a live price', () => {
    const origins = [{ code: 'MOW', name: 'Москва' }, { code: 'LED', name: 'Санкт-Петербург' }];
    expect(originForHome(origins, 'Москва')).toBe('MOW');
    expect(originForHome(origins, 'Петербург')).toBe('LED');
    expect(originForHome(origins, 'Тула')).toBeNull();
    expect(liveVerdict(10000, 10200).kind).toBe('same');
    expect(liveVerdict(10000, 12000).text).toBe('Подорожало до 12\u00a0000\u00a0₽ (+20%)');
    expect(liveVerdict(10000, 9000).kind).toBe('cheaper');
    expect(liveVerdict(10000, null).kind).toBe('gone');
  });
  it('filters deals by departure city', () => {
    const d = (id: string, origin: string, discount: number) => ({ id, origin, discount, foundAt: '2026-11-01' }) as never;
    expect(dealsFrom([d('a', 'MOW', 40), d('b', 'LED', 70), d('c', 'MOW', 60)], 'MOW').map((x: { id: string }) => x.id)).toEqual(['c', 'a']);
  });
});

import { SOURCES } from './sources';

describe('sources', () => {
  it('flattens the list with unique ids, sections and no aggregators', () => {
    const ids = SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('samokatus');
    expect(SOURCES.find((s) => s.id === 'pobedaairlines')).toMatchObject({ kind: 'telegram', ref: 'PobedaAirlines', section: 'Авиа', group: 'Авиакомпании' });
    expect(SOURCES.find((s) => s.id === 'tass')).toMatchObject({ kind: 'rss', section: 'Остальное', group: 'СМИ', only: ['Туризм и отдых'] });
    expect(SOURCES.find((s) => s.id === 'tourdom')?.kind).toBe('rss');
  });
});

import { addEdition, applyTranslations, buildEdition, editionSlot, localize, pendingTranslations, StoryDraftSchema, storyCandidates } from './editorial';

describe('translations', () => {
  const en = { ...item('euronews', '1', '2026-11-01T08:00:00Z', 'Paris metro strike closes 40 stations'), lang: 'en' as const };
  const ru = item('atorus', '2', '2026-11-01T07:00:00Z', 'Черногория ввела визы для россиян');
  it('hides foreign news until translated, then shows Russian text with topics', () => {
    expect(localize([en, ru], null).map((n) => n.id)).toEqual(['atorus:2']);
    expect(pendingTranslations([en, ru], null).map((n) => n.id)).toEqual(['euronews:1']);
    const t = applyTranslations(null, [{ id: 'euronews:1', title: 'В Париже из-за забастовки закроют 40 станций метро', text: 'Перебои продлятся два дня.' }], [en, ru], new Date('2026-11-01T09:00:00Z'));
    const out = localize([en, ru], t);
    expect(out[0]).toMatchObject({ title: 'В Париже из-за забастовки закроют 40 станций метро', lang: 'en' });
    expect(pendingTranslations([en, ru], t)).toEqual([]);
    // Translations of news that left the feed are dropped; unknown ids are rejected.
    expect(Object.keys(applyTranslations(t, [], [ru], new Date()).items)).toEqual([]);
    expect(() => applyTranslations(t, [{ id: 'x:1', title: 'Выдумка', text: '' }], [en], new Date())).toThrow();
    // Skipped news stay hidden and are not offered again.
    const skipped = applyTranslations(null, [{ id: 'euronews:1', skip: true }], [en, ru], new Date());
    expect(localize([en, ru], skipped).map((n) => n.id)).toEqual(['atorus:2']);
    expect(pendingTranslations([en, ru], skipped)).toEqual([]);
  });
});

describe('Интересное', () => {
  const stories = [item('wrenjapan', '7', '2026-11-01T05:00:00Z', 'Музей Нихон Минка-эн в пригороде Токио'), item('grushiny', '3', '2026-10-28T05:00:00Z', 'Старый пост про Фукуок')];
  const sources = [{ id: 'wrenjapan', name: 'Врен о Японии', kind: 'telegram' as const, url: 'https://t.me/wrenjapan', ok: true }];
  it('slots, candidates and author links', () => {
    expect(editionSlot(new Date('2026-11-01T05:47:00Z'))).toEqual({ date: '2026-11-01', part: 'morning' });
    expect(editionSlot(new Date('2026-11-01T16:47:00Z'))).toEqual({ date: '2026-11-01', part: 'evening' });
    const now = new Date('2026-11-01T05:47:00Z');
    expect(storyCandidates(stories, null, now).map((s) => s.id)).toEqual(['wrenjapan:7']);
    const draft = StoryDraftSchema.parse({ items: [{ country: 'JP', place: 'Япония', text: 'в пригороде Токио советуют музей под открытым небом', storyIds: ['wrenjapan:7'] }] });
    const ed = buildEdition(draft, stories, sources, now);
    expect(ed).toMatchObject({ id: '2026-11-01-morning', items: [{ links: [{ name: 'Врен о Японии', url: 'https://t.me/wrenjapan/7' }] }] });
    const file = addEdition(null, ed);
    expect(storyCandidates(stories, file, now)).toEqual([]);
    expect(() => buildEdition({ items: [{ ...draft.items[0]!, storyIds: ['wrenjapan:999'] }] }, stories, sources, now)).toThrow();
  });
});

import { dedupe as dedupeReal } from './text';

/** Real posts of 31.10–01.11.2026: retellings must merge, look-alikes must not. */
const REAL: Array<[string, string, string, string]> = [
  ["uletet_1", "2026-11-01T06:43:29.000Z", "❗🇲🇪 С сегодняшнего дня Черногория ввела визы для граждан России.", "Двустороннее соглашение о безвизовых поездках действовало с 2008 года, более 18 лет. С 1 ноября для въезда в страну россиянам понадобится черногорская виза, которую необходимо получить заблаговременно: 🔻стоимость для взрослых: 35 евро; 🔻стоимость для детей до 14 лет: 17,5 евро. Черногорская виза действует для…"],
  ["atorus", "2026-11-01T06:20:14.000Z", "🇲🇪 С сегодняшнего дня в Черногорию по одному загранпаспорту уже не попасть", "С 1 ноября для россиян действует визовый режим. Консульский сбор составляет €35, при подаче через VFS Global отдельно оплачиваются услуги визового центра. Документы принимают в восьми городах России. Но оформлять черногорскую визу придется не всем. Въехать можно с действующей шенгенской визой, а также визами США…"],
  ["atorus", "2026-10-31T09:07:54.000Z", "🇮🇳 Группового безвиза с Индией не будет", "Об этом рассказал в интервью ТАСС глава консульского департамента МИД России Алексей Климов. Предполагалось, что туристы смогут ездить без виз группами от 3 до 50 человек на срок до 21 дня. Но, по словам дипломата, подготовка соглашения изначально была непростой задачей: индийская сторона раньше не заключала…"],
  ["tourdom", "2026-10-31T07:21:50.000Z", "Россия и Индия остановили переговоры о безвизе для туристических групп", "Для поездок россиянам по-прежнему нужна бесплатная электронная туристическая виза"],
  ["uletet_1", "2026-10-31T09:47:31.000Z", "🇮🇳🇷🇺 Безвизовый режим для туристических групп между Россией и Индией вводиться не будет.", "Об этом заявил глава консульского департамента МИД России Алексей Климов. «Разработка такого соглашения изначально являлась нетривиальной задачей ввиду того, что заключение международных договоров на тему групповых безвизовых поездок граждан нашими индийскими партнерами ранее не практиковалось. Принимая во внимание…"],
  ["tourprom", "2026-10-31T13:03:29.000Z", "Безвиз с Индией отменяется: что изменится для российских туристов", "Российским туристам, планирующим отдых в Индии, не стоит ждать упрощения правил въезда в ближайшее время. Переговоры между Москвой и Нью-Дели о введении безвизового режима для туристических групп официально прекращены. Стороны пришли к выводу, что реализация такой инициативы на данном этапе невозможна. Идея…"],
  ["tourdom", "2026-10-31T11:16:38.000Z", "В аэропортах Москвы задержки рейсов в Египет и Турцию достигают 19 и 12 часов", "Какие вылеты отложены"],
  ["tourprom", "2026-10-31T16:03:25.000Z", "Турция и Египет начнут схватку за туристов", "На престижном саммите Всемирного совета по туризму и путешествиям (WTTC), прошедшем в Валлетте (Мальта), развернулось жёсткое дипломатическое противостояние между ключевыми игроками трэвел-рынка. В то время как перегруженная овертуризмом Европа (Хорватия и Мальта) открыто умоляет снизить трафик, заявляя, что им больше…"],
  ["atorus", "2026-10-31T14:22:59.000Z", "🏖 В Аджмане начали открывать пляжи", "Хорошая новость от Fairmont Ajman: его пляж очищен и 31 октября с 16:00 купание официально разрешено. Об этом «Вестнику АТОР» сообщили в «Интуристе» со ссылкой на официальное письмо отеля. С 1 ноября Fairmont Ajman прекращает бесплатные трансферы на Kite Beach в Дубае, которые организовывал на время закрытия своего…"],
  ["tourdom", "2026-10-31T07:19:48.000Z", "В Сочи и Анапе не будут открывать зимние пляжи в 2026 году", "Всего в Краснодарском крае будут работать 29 таких площадок"],
  ["tourdom", "2026-10-31T15:47:00.000Z", "В Турции закрывается популярный семейный курорт", "Он меняет владельца и название"],
  ["tass", "2026-11-01T05:09:22.000Z", "Сервис \"Плати по всему миру\" назвал самые популярные осенние турнаправления", "В бархатный сезон россияне чаще всего ездили в Турцию, Китай и Объединенные Арабские Эмираты"],
];

describe('duplicates on real posts', () => {
  const items = REAL.map(([sourceId, at, title, text], i) => ({ id: `${sourceId}:${i}`, sourceId, url: `https://x/${i}`, at, title, text, tags: [], also: [] }));
  const groups = dedupeReal(items).map((it) => [it.id, ...it.also.map((a) => items.find((x) => x.url === a.url)?.id)].sort().join(' '));
  it('merges Черногория and the four Индия posts', () => {
    expect(groups).toContain(['atorus:1', 'uletet_1:0'].join(' '));
    expect(groups.find((g) => g.includes('atorus:2'))?.split(' ').length).toBe(4);
  });
  it('keeps different stories apart', () => {
    for (const pair of [['tourdom:6', 'tourprom:7'], ['atorus:8', 'tourdom:9'], ['tourdom:10', 'tass:11']]) expect(groups.some((g) => pair.every((p) => g.split(' ').includes(p)))).toBe(false);
  });
  it('never merges two airlines', () => {
    const a = { ...items[0]!, id: 'aeroflot:1', sourceId: 'aeroflot', url: 'a' };
    const b = { ...items[1]!, id: 'pobeda:1', sourceId: 'pobeda', url: 'b' };
    expect(dedupeReal([a, b], (s) => s === 'aeroflot' || s === 'pobeda')).toHaveLength(2);
    // A retelling with a real headline leads, the airline's notice becomes a link.
    const merged = dedupeReal([a, { ...b, sourceId: 'atorus', id: 'atorus:9' }], (s) => s === 'aeroflot');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.sourceId).toBe('atorus');
  });
});

import { orderStories, sourceVisible } from './visibility';
import { STORY_SOURCES as STORIES_ALL } from './sources';
describe('feed visibility', () => {
  const off = { rider: false, surf: false, sportNews: false, hidden: [] as string[] };
  it('hides hidden sources and keeps ordinary ones', () => {
    const any = SOURCES[0]?.id ?? 'x';
    expect(sourceVisible(any, off)).toBe(true);
    expect(sourceVisible(any, { ...off, hidden: [any] })).toBe(false);
  });
  it('shows sport sources only to riders / surfers or with «Спортивные новости»', () => {
    for (const s of [...SOURCES, ...STORIES_ALL].filter((x) => x.hobby)) {
      expect(sourceVisible(s.id, off)).toBe(false);
      expect(sourceVisible(s.id, { ...off, sportNews: true })).toBe(true);
      expect(sourceVisible(s.id, { ...off, rider: s.hobby === 'rider', surf: s.hobby === 'surf' })).toBe(true);
    }
  });
  it('puts stories of the reader’s hobbies first', () => {
    const sport = [...SOURCES, ...STORIES_ALL].find((x) => x.hobby === 'rider');
    const plain = STORIES_ALL.find((x) => !x.hobby);
    if (!sport || !plain) return;
    const items = [{ storyIds: [`${plain.id}:1`] }, { storyIds: [`${sport.id}:2`] }];
    expect(orderStories(items, { ...off, rider: true }).map((s) => s.storyIds[0])).toEqual([`${sport.id}:2`, `${plain.id}:1`]);
    expect(orderStories(items, off).map((s) => s.storyIds[0])).toEqual([`${plain.id}:1`]);
  });
});

import { classifyStatus, currentNotices } from './resortStatus';
describe('resort notices', () => {
  it('recognises closures, openings and snow; ignores everything else', () => {
    expect(classifyStatus('Уважаемые гости! Из-за сильного ветра трасса А временно закрыта.')).toBe('critical');
    expect(classifyStatus('Сегодня временно приостановлена работа подъёмников на секторе Е')).toBe('critical');
    expect(classifyStatus('Канатная дорога «Олимпия» не работает до 12:00')).toBe('critical');
    expect(classifyStatus('Объявлена лавинная опасность, внетрассовое катание запрещено')).toBe('critical');
    expect(classifyStatus('Курорт возобновил работу после непогоды, все подъёмники открыты')).toBe('info');
    expect(classifyStatus('За ночь выпало 30 см свежего снега!')).toBe('info');
    expect(classifyStatus('Открыли ещё две трассы на верхних отметках')).toBe('info');
    expect(classifyStatus('Gondola on wind hold this morning')).toBe('critical');
    expect(classifyStatus('Скидка 20% на ски-пасс для студентов до конца недели')).toBeNull();
    expect(classifyStatus('Поздравляем с Новым годом!')).toBeNull();
  });
  it('shows only fresh notices of the chosen resorts, without reposts', () => {
    const now = new Date('2026-12-10T12:00:00Z');
    const n = (id: string, resortId: string, level: 'critical' | 'info', at: string, text = 'Трасса А закрыта') => ({ id, resortId, level, text, url: 'u', at, source: 'c' });
    const items = [
      n('c:1', 'r1', 'critical', '2026-12-10T08:00:00Z'),
      n('c:2', 'r1', 'critical', '2026-12-10T09:00:00Z'),
      n('c:3', 'r1', 'critical', '2026-12-08T08:00:00Z', 'Подъёмник остановлен'),
      n('c:4', 'r1', 'info', '2026-12-08T08:00:00Z', 'Выпало 20 см снега'),
      n('c:5', 'r2', 'critical', '2026-12-10T10:00:00Z'),
    ];
    expect(currentNotices(items, new Set(['r1']), now).map((x) => x.id)).toEqual(['c:2', 'c:4']);
  });
});
