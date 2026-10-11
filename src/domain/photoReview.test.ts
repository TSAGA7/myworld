import { describe, expect, it } from 'vitest';
import type { FoundCountry, FoundTrip } from './photoPlaces';
import { type Edits, NO_EDITS, type Place, placesToSave, reviewRows, tripsToSave } from './photoReview';

const place = (id: string, name: string, countryId: string): Place => ({ id, name, nameEn: '', countryId, lat: 1, lon: 1, region: '', source: 'catalog' });
const places = new Map([
  ['bish', place('bish', 'Бишкек', 'KG')],
  ['bal', place('bal', 'Балыкчи', 'KG')],
]);
const found: FoundCountry[] = [
  { countryId: 'KG', first: '2026-07-29', last: '2026-08-02', photos: 22, cities: [
    { cityId: 'bish', countryId: 'KG', first: '2026-07-29', last: '2026-07-30', photos: 12 },
    { cityId: 'bal', countryId: 'KG', first: '2026-08-01', last: '2026-08-02', photos: 10 },
  ] },
];
const KARAKOL = place('kar', 'Каракол', 'KG');

describe('photo review', () => {
  it('shows what the photos found when nothing is edited', () => {
    const rows = reviewRows(found, places, NO_EDITS);
    expect(rows[0]).toMatchObject({ countryId: 'KG', date: '2026-07-29', on: true });
    expect(placesToSave(rows).map((p) => [p.city?.name ?? p.countryId, p.date])).toEqual([
      ['KG', '2026-07-29'],
      ['Бишкек', '2026-07-29'],
      ['Балыкчи', '2026-08-01'],
    ]);
  });

  it('applies hand-entered dates, a replaced city, an added city and unchecked places', () => {
    const e: Edits = {
      off: new Set(['y:bish']),
      dates: new Map<string, string | null>([['c:KG', '2019-05-01'], ['y:bal', null], ['m:u:1', '2026-07-31']]),
      replace: new Map([['bal', KARAKOL]]),
      extra: new Map([['KG', [place('u:1', 'Чолпон-Ата', 'KG')]]]),
    };
    const rows = reviewRows(found, places, e);
    expect(rows[0]!.cities.map((y) => [y.city.name, y.on, y.date, y.replaced, y.manual])).toEqual([
      ['Бишкек', false, '2026-07-29', false, false],
      ['Каракол', true, null, true, false],
      ['Чолпон-Ата', true, '2026-07-31', false, true],
    ]);
    expect(placesToSave(rows).map((p) => [p.city?.name ?? p.countryId, p.date])).toEqual([
      ['KG', '2019-05-01'],
      ['Каракол', null],
      ['Чолпон-Ата', '2026-07-31'],
    ]);
  });

  it('skips a whole country when it is unchecked, and merges two found cities replaced by the same one', () => {
    expect(placesToSave(reviewRows(found, places, { ...NO_EDITS, off: new Set(['c:KG']) }))).toEqual([]);
    const both = reviewRows(found, places, { ...NO_EDITS, replace: new Map([['bish', KARAKOL], ['bal', KARAKOL]]) });
    expect(placesToSave(both).map((p) => [p.city?.name ?? p.countryId, p.date])).toEqual([
      ['KG', '2026-07-29'],
      ['Каракол', '2026-07-29'],
    ]);
  });

  it('builds trips with the replaced cities and leaves out unchecked trips', () => {
    const trips: FoundTrip[] = [
      { start: '2026-07-29', end: '2026-08-02', countryIds: ['KG'], photos: 22, stops: [
        { cityId: 'bish', countryId: 'KG', start: '2026-07-29', end: '2026-07-30' },
        { cityId: 'bal', countryId: 'KG', start: '2026-08-01', end: '2026-08-02' },
      ] },
      { start: '2026-09-01', end: '2026-09-02', countryIds: ['KG'], photos: 1, stops: [] },
    ];
    const out = tripsToSave(trips, places, { ...NO_EDITS, off: new Set(['t:1']), replace: new Map([['bal', KARAKOL]]) }, () => 'Киргизия');
    expect(out).toHaveLength(1);
    expect(out[0]!.stops.map((s) => [s.city.name, s.startDate, s.endDate])).toEqual([
      ['Бишкек', '2026-07-29', '2026-07-30'],
      ['Каракол', '2026-08-01', '2026-08-02'],
    ]);
  });
});
