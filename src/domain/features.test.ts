import { describe, expect, it } from 'vitest';
import { achievements, computeFacts, distanceKm } from './achievements';
import { findDates, findPrice, parseBooking } from './bookingParser';
import { settle, summarizeExpenses } from './expenses';
import { buildIcs, googleMapsUrl, twoGisUrl } from './exportTrip';
import { packingList, summarizeWeather, visaFor } from './hints';
import type { City, Expense, Trip, TripStop } from './model';
import { deriveWorld, type CountryRef } from './world';

const NOW = '2026-10-11T00:00:00.000Z';
const rates = { USD: 80, EUR: 100 };
const exp = (o: Partial<Expense>): Expense => ({
  id: Math.random().toString(36), tripId: 't', date: '2026-09-10', category: 'food', amount: 0, currency: 'RUB', note: '', paidBy: 'me', splitWith: [],
  createdAt: NOW, updatedAt: NOW, ...o,
});

describe('expenses', () => {
  it('sums by day and category in one currency', () => {
    const s = summarizeExpenses([exp({ amount: 1000 }), exp({ amount: 10, currency: 'EUR', category: 'transport' }), exp({ amount: 5, currency: 'CHF' }), exp({ amount: 500, date: '2026-09-11' })], 'RUB', rates);
    expect(s.total).toBe(2500);
    expect(s.skipped).toBe(1);
    expect(s.byDay.map((d) => [d.date, d.total])).toEqual([['2026-09-11', 500], ['2026-09-10', 2000]]);
    expect(s.byCategory[0]).toEqual({ category: 'food', total: 1500 });
  });
  it('settles debts with few transfers', () => {
    const members = [{ id: 'a', name: 'Аня' }, { id: 'b', name: 'Боря' }];
    const { transfers, balances } = settle(
      [exp({ amount: 3000, paidBy: 'me' }), exp({ amount: 600, paidBy: 'a', splitWith: ['a', 'b'] })],
      members, 'RUB', rates,
    );
    expect(balances.get('me')).toBeCloseTo(2000);
    expect(transfers).toEqual([
      { from: 'b', to: 'me', amount: 1300 },
      { from: 'a', to: 'me', amount: 700 },
    ]);
  });
});

describe('facts and achievements', () => {
  const city = (id: string, lat: number, lon: number, countryId: string): City => ({ id, name: id, nameEn: '', countryId, lat, lon, region: '', source: 'catalog', createdAt: NOW, updatedAt: NOW });
  const cities = new Map([
    ['msk', city('msk', 55.75, 37.62, 'RU')],
    ['rome', city('rome', 41.9, 12.5, 'IT')],
    ['rio', city('rio', -22.9, -43.2, 'BR')],
    ['trom', city('trom', 69.65, 18.96, 'NO')],
  ]);
  const visits = ['rome', 'rio', 'trom'].map((id) => ({ id, key: `city:${id}`, cityId: id, countryId: cities.get(id)!.countryId, date: '2026-01-01', tripIds: [], manual: true, createdAt: NOW, updatedAt: NOW }));
  const trip = { id: 't', startDate: '2026-01-01', endDate: '2026-01-05' } as Trip;
  const stops = [{ tripId: 't', order: 0, cityId: 'rome' }, { tripId: 't', order: 1, cityId: 'trom' }] as TripStop[];
  const world = deriveWorld(visits, [], stops);
  const countries = [
    { id: 'IT', continent: 'Европа' }, { id: 'BR', continent: 'Южная Америка' }, { id: 'NO', continent: 'Европа' },
  ] as CountryRef[];
  const f = computeFacts({ world, countries, cities, trips: [trip], stops, visits, percent: 1.5, home: cities.get('msk')!, today: '2026-10-11' });
  it('computes distances and extremes', () => {
    expect(Math.round(distanceKm({ lat: 55.75, lon: 37.62 }, { lat: 41.9, lon: 12.5 }))).toBe(2375);
    expect(f.north?.id).toBe('trom');
    expect(f.south?.id).toBe('rio');
    expect(f.farthestFromHome?.city.id).toBe('rio');
    expect(f.continents.sort()).toEqual(['Европа', 'Южная Америка']);
    expect(f.routeKm).toBeGreaterThan(2376 + 3000);
    expect(f.countriesThisYear).toBe(3);
  });
  it('unlocks achievements', () => {
    const a = new Map(achievements(f, world, cities, { tripsCreated: 1, diary: 0, expenses: 0 }).map((x) => [x.id, x]));
    expect(a.get('first')?.done).toBe(true);
    expect(a.get('polar')?.done).toBe(true);
    expect(a.get('equator')?.done).toBe(true);
    expect(a.get('c5')?.value).toBe(3);
    expect(a.get('c5')?.done).toBe(false);
  });
});

describe('export', () => {
  it('builds a calendar with floating times and folded lines', () => {
    const ics = buildIcs(
      { id: 't', title: 'Италия', startDate: '2026-09-10', endDate: '2026-09-20', note: '' } as Trip,
      [],
      [{ id: 'f', mode: 'flight', from: 'SVO', to: 'FCO', number: 'SU 2402', carrier: 'Аэрофлот', departDate: '2026-09-10', departTime: '07:25', arriveDate: '2026-09-10', arriveTime: '10:05', confirmation: 'ABC123', note: '' } as never],
      [{ id: 's', name: 'Hotel Roma', address: 'Via del Corso, 1, Roma', checkIn: '2026-09-10', checkOut: '2026-09-13', confirmation: '', contact: '', note: '' } as never],
      [],
      '20261011T000000Z',
      () => 'Самолёт',
    );
    expect(ics).toContain('DTSTART:20260910T072500');
    expect(ics).toContain('DTEND:20260910T100500');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260910');
    expect(ics).toContain('DTEND;VALUE=DATE:20260921');
    expect(ics).toContain('LOCATION:Via del Corso\\, 1\\, Roma');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('makes map links', () => {
    const pts = [{ name: 'A', lat: 41.9, lon: 12.5 }, { name: 'B', lat: 43.77, lon: 11.25 }, { name: 'C', lat: 45.46, lon: 9.19 }];
    const g = googleMapsUrl(pts) as string;
    expect(g).toContain('origin=41.900000%2C12.500000');
    expect(g).toContain('waypoints=43.770000%2C11.250000');
    expect(twoGisUrl(pts)).toBe('https://2gis.ru/directions/points/12.500000%2C41.900000%7C11.250000%2C43.770000%7C9.190000%2C45.460000');
  });
});

describe('booking parser', () => {
  it('reads an airline e-ticket', () => {
    const p = parseBooking(
      `Аэрофлот\nЭлектронный билет\nКод бронирования: KX7ZQP\nРейс SU 2402\nМосква SVO — Рим FCO\n10 сентября 2026  07:25 → 10:05\nИтого: 32 500 ₽`,
      2026,
    );
    expect(p.kind).toBe('transport');
    expect(p.mode).toBe('flight');
    expect(p.number).toBe('SU 2402');
    expect(p.carrier).toBe('Аэрофлот');
    expect([p.from, p.to]).toEqual(['SVO', 'FCO']);
    expect(p.confirmation).toBe('KX7ZQP');
    expect(p.dates[0]).toBe('2026-09-10');
    expect(p.times.slice(0, 2)).toEqual(['07:25', '10:05']);
    expect(p).toMatchObject({ price: 32500, currency: 'RUB' });
  });
  it('reads a hotel confirmation', () => {
    const p = parseBooking(
      `Booking.com\nBooking number: 4012.556.889\nHotel: Artemide Roma\nAddress: Via Nazionale 22, 00184 Rome, Italy\nCheck-in Thu, Sep 10, 2026\nCheck-out Sun, Sep 13, 2026\nTotal price € 640.50`,
      2026,
    );
    expect(p.kind).toBe('stay');
    expect(p.title).toBe('Artemide Roma');
    expect(p.address).toContain('Via Nazionale 22');
    expect(p.dates).toEqual(['2026-09-10', '2026-09-13']);
    expect(p).toMatchObject({ price: 640.5, currency: 'EUR' });
  });
  it('reads a train ticket', () => {
    const p = parseBooking(`РЖД\nПоезд № 752А «Сапсан»\nМосква — Санкт-Петербург\n12.10.2026 06:50 — 10:45\nВагон 5 место 23\nСтоимость 4 870,00 руб.`, 2026);
    expect(p).toMatchObject({ kind: 'transport', mode: 'train', number: '752А', carrier: 'РЖД', from: 'Москва', to: 'Санкт-Петербург', price: 4870, currency: 'RUB' });
    expect(p.dates).toEqual(['2026-10-12']);
  });
  it('finds dates and prices in many formats', () => {
    expect(findDates('Вылет 05.11.26, обратно 9 ноя', 2026)).toEqual(['2026-11-05', '2026-11-09']);
    expect(findPrice('Total: USD 1,250.00')).toEqual({ price: 1250, currency: 'USD' });
  });
});

describe('hints', () => {
  it('knows entry rules and packing', () => {
    expect(visaFor('TR')?.status).toBe('free');
    expect(visaFor('IT')?.status).toBe('visa');
    expect(visaFor('XX')).toBeNull();
    const w = summarizeWeather([{ date: 'a', tMax: 31, tMin: 22, rain: 0 }, { date: 'b', tMax: 29, tMin: 21, rain: 5 }]);
    expect(packingList(w, { flight: true, drivesLeft: false, beach: false })).toEqual(expect.arrayContaining(['Солнцезащитный крем', 'Купальник/плавки', 'Зонт или дождевик']));
  });
});

import { travelerStatus } from './status';
describe('traveller status', () => {
  it('picks the status by countries', () => {
    expect(travelerStatus(0).status.title).toBe('Тебе точно нужно это приложение?');
    expect(travelerStatus(0).toNext).toBe(1);
    expect(travelerStatus(3).status.from).toBe(1);
    expect(travelerStatus(4).status.title).toMatch(/взлетаем/);
    expect(travelerStatus(15).toNext).toBe(1);
    expect(travelerStatus(25).status.from).toBe(16);
    expect(travelerStatus(50).status.title).toBe('Сильнейший, вопросов нет');
    expect(travelerStatus(120)).toMatchObject({ next: null, progress: 1 });
  });
});
