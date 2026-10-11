import { describe, expect, it } from 'vitest';
import { classOfCompartment, dateOfDay, hasNonLatin, iataIn, isFlightNumber, isPnr, isSeat, parseBcbp, travelMinutes, typeFlightNumber, typeIata, typePnr } from './ticket';

describe('ticket fields', () => {
  it('types flight numbers in Latin, converting Cyrillic look-alikes', () => {
    expect(typeFlightNumber('su2402')).toBe('SU 2402');
    expect(typeFlightNumber('СУ')).toBe('SU'); // Aeroflot's code on Russian tickets
    expect(typeFlightNumber('ыг2402')).toBe('SU 2402'); // typed on the Russian layout
    expect(typeFlightNumber('Ѕ7 1001')).toBe('S7 1001');
    expect(typeFlightNumber('ТК 418')).toBe('TK 418');
    expect(typeFlightNumber('u6-263')).toBe('U6 263');
    expect(isFlightNumber('SU 2402')).toBe(true);
    expect(isFlightNumber('S7 1')).toBe(true);
    expect(isFlightNumber('СУ 2402')).toBe(false);
    expect(hasNonLatin('Аэрофлот')).toBe(true);
    expect(hasNonLatin('АВС')).toBe(false);
  });
  it('validates codes', () => {
    expect(typeIata('svo1')).toBe('SVO');
    expect(iataIn('Москва, SVO')).toBe('SVO');
    expect(iataIn('Рим (FCO)')).toBe('FCO');
    expect(iataIn('Москва')).toBe('');
    expect(typePnr('АВС12-3')).toBe('ABC123');
    expect(typePnr('фид123')).toBe('ABL123');
    expect(isPnr('ABC123')).toBe(true);
    expect(isPnr('AB')).toBe(false);
    expect(isSeat('12A')).toBe(true);
    expect(isSeat('A12')).toBe(false);
  });
  it('counts travel time across time zones', () => {
    // Moscow 10:40 (UTC+3) → Rome 13:15 (UTC+2 in October before DST ends) = 3 h 35 min
    expect(travelMinutes({ date: '2026-10-12', time: '10:40', tz: 'Europe/Moscow' }, { date: '2026-10-12', time: '13:15', tz: 'Europe/Rome' })).toBe(215);
    // London → New York, summer
    expect(travelMinutes({ date: '2026-07-01', time: '10:00', tz: 'Europe/London' }, { date: '2026-07-01', time: '13:00', tz: 'America/New_York' })).toBe(480);
    // overnight without arrival date, same zone
    expect(travelMinutes({ date: '2026-07-01', time: '23:30' }, { date: null, time: '01:10' })).toBe(100);
    expect(travelMinutes({ date: null, time: '10:00' }, { date: null, time: '12:00' })).toBeNull();
  });
  it('reads an IATA boarding pass barcode', () => {
    const raw = 'M1IVANOV/IVAN         EABC123 SVOFCOSU 2402 285Y012A0001 100';
    const b = parseBcbp(raw);
    expect(b).toMatchObject({ passenger: 'IVAN IVANOV', pnr: 'ABC123', from: 'SVO', to: 'FCO', flight: 'SU 2402', seat: '12A', dayOfYear: 285, compartment: 'Y' });
    expect(classOfCompartment('Y')).toBe('economy');
    expect(classOfCompartment('J')).toBe('business');
    expect(dateOfDay(285, '2026-10-01')).toBe('2026-10-12');
    expect(dateOfDay(2, '2026-12-30')).toBe('2027-01-02');
    expect(parseBcbp('hello')).toBeNull();
  });
});
