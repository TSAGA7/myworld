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
    expect(r.posts[0]).toMatchObject({ id: '101', url: 'https://t.me/samokatus/101', at: '2026-10-30T09:15:00.000Z' });
    expect(r.posts[0]?.text).toBe('S7 Airlines запустила прямые рейсы из Новосибирска в Мале.\nПолеты дважды в неделю на A320 & с посадкой в Термезе.');
  });

  it('reads RSS and Atom', () => {
    const rss = `<rss><channel><title>Турдом</title><item><title><![CDATA[Грузия отменила сбор]]></title><link>https://t.ru/a</link><pubDate>Sat, 31 Oct 2026 08:00:00 +0300</pubDate><description>&lt;p&gt;Подробности ниже&lt;/p&gt;</description></item></channel></rss>`;
    const r = parseFeed(rss);
    expect(r.title).toBe('Турдом');
    expect(r.posts[0]).toMatchObject({ url: 'https://t.ru/a', at: '2026-10-31T05:00:00.000Z', text: 'Грузия отменила сбор\nПодробности ниже' });
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

import { ago, dayMonth, dealsFrom, durationLabel, fromCity, liveVerdict, originForHome, rub, transfersLabel } from './format';

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
