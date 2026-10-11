import type { AccommodationBooking, City, GeneralBooking, TransportBooking, Trip, TripStop } from './model';

/** Calendar file (RFC 5545). Times are "floating": 07:25 in the ticket stays 07:25 in the calendar wherever the phone is. */
export function buildIcs(
  trip: Trip,
  route: ReadonlyArray<{ stop: TripStop; city: City | undefined }>,
  transport: readonly TransportBooking[],
  stays: readonly AccommodationBooking[],
  bookings: readonly GeneralBooking[],
  stamp: string,
  modeLabel: (m: TransportBooking['mode']) => string,
): string {
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MY WORLD//Trip//RU', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(trip.title)}`];
  const dt = (d: string) => d.replace(/-/g, '');
  const dtt = (d: string, t: string) => `${dt(d)}T${t.replace(':', '')}00`;
  const next = (d: string) => {
    const [y, m, day] = d.split('-').map(Number);
    const x = new Date(Date.UTC(y as number, (m as number) - 1, (day as number) + 1));
    return x.toISOString().slice(0, 10);
  };
  const ev = (uid: string, summary: string, start: string, end: string, allDay: boolean, location = '', description = '') => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@myworld`, `DTSTAMP:${stamp}`);
    lines.push(allDay ? `DTSTART;VALUE=DATE:${start}` : `DTSTART:${start}`);
    lines.push(allDay ? `DTEND;VALUE=DATE:${end}` : `DTEND:${end}`);
    lines.push(`SUMMARY:${esc(summary)}`);
    if (location) lines.push(`LOCATION:${esc(location)}`);
    if (description) lines.push(`DESCRIPTION:${esc(description)}`);
    lines.push('END:VEVENT');
  };
  if (trip.startDate) ev(`trip-${trip.id}`, `✈︎ ${trip.title}`, dt(trip.startDate), dt(next(trip.endDate ?? trip.startDate)), true, '', trip.note);
  for (const { stop, city } of route) {
    if (!stop.startDate) continue;
    ev(`stop-${stop.id}`, `📍 ${city?.name ?? 'Город'}`, dt(stop.startDate), dt(next(stop.endDate ?? stop.startDate)), true, city?.name ?? '');
  }
  for (const t of transport) {
    if (!t.departDate) continue;
    const title = `${modeLabel(t.mode)} ${[t.from, t.to].filter(Boolean).join(' → ')}${t.number ? ` (${t.number})` : ''}`.trim();
    const desc = [t.carrier, t.confirmation && `Бронь: ${t.confirmation}`, t.note].filter(Boolean).join('\n');
    if (t.departTime) {
      const endDate = t.arriveDate ?? t.departDate;
      const end = t.arriveTime ? dtt(endDate, t.arriveTime) : dtt(t.departDate, addHour(t.departTime));
      ev(`tr-${t.id}`, title, dtt(t.departDate, t.departTime), end > dtt(t.departDate, t.departTime) ? end : dtt(t.departDate, addHour(t.departTime)), false, t.from, desc);
    } else ev(`tr-${t.id}`, title, dt(t.departDate), dt(next(t.departDate)), true, t.from, desc);
  }
  for (const s of stays) {
    const desc = [s.confirmation && `Бронь: ${s.confirmation}`, s.contact, s.note].filter(Boolean).join('\n');
    if (s.checkIn) ev(`in-${s.id}`, `🛏 Заезд: ${s.name}`, dt(s.checkIn), dt(next(s.checkIn)), true, s.address, desc);
    if (s.checkOut) ev(`out-${s.id}`, `🛏 Выезд: ${s.name}`, dt(s.checkOut), dt(next(s.checkOut)), true, s.address, desc);
  }
  for (const b of bookings) {
    if (!b.date) continue;
    const desc = [b.confirmation && `№ ${b.confirmation}`, b.note].filter(Boolean).join('\n');
    if (b.time) ev(`bk-${b.id}`, b.title, dtt(b.date, b.time), dtt(b.date, addHour(b.time, 2)), false, b.place, desc);
    else ev(`bk-${b.id}`, b.title, dt(b.date), dt(next(b.date)), true, b.place, desc);
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

const addHour = (t: string, h = 1) => {
  const [hh, mm] = t.split(':').map(Number);
  const v = Math.min(23 * 60 + 59, (hh as number) * 60 + (mm as number) + h * 60);
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
/** Lines longer than 75 octets are folded (RFC 5545 §3.1), without splitting a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export interface RoutePoint {
  name: string;
  lat: number;
  lon: number;
}

/** Google Maps route (official "Maps URLs"): origin, destination and up to 9 waypoints. */
export function googleMapsUrl(points: readonly RoutePoint[], mode: 'driving' | 'walking' | 'transit' = 'driving'): string | null {
  if (points.length === 0) return null;
  const f = (p: RoutePoint) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
  if (points.length === 1) return `https://www.google.com/maps/search/?api=1&query=${f(points[0] as RoutePoint)}`;
  const pts = points.slice(0, 11);
  const origin = pts[0] as RoutePoint;
  const dest = pts[pts.length - 1] as RoutePoint;
  const mid = pts.slice(1, -1);
  const q = new URLSearchParams({ api: '1', origin: f(origin), destination: f(dest), travelmode: mode });
  if (mid.length) q.set('waypoints', mid.map(f).join('|'));
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

/** 2GIS route: points as "lon,lat" separated by "|". Opens the 2GIS app when it is installed. */
export function twoGisUrl(points: readonly RoutePoint[]): string | null {
  if (points.length === 0) return null;
  const f = (p: RoutePoint) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)}`;
  if (points.length === 1) {
    const p = points[0] as RoutePoint;
    return `https://2gis.ru/geo/${f(p)}?m=${f(p)}%2F16`;
  }
  return `https://2gis.ru/directions/points/${points.slice(0, 10).map(f).map(encodeURIComponent).join('%7C')}`;
}
