import { db } from '../app/world';
import type { DayWeather } from '../domain/hints';

/** Small helpers for the free online services the app uses. Every call fails gracefully: the app keeps working offline. */

async function getJson<T>(url: string, timeoutMs = 12000): Promise<T> {
  if (!navigator.onLine) throw new Error('Нет интернета');
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`Сервис ответил ${r.status}`);
    return (await r.json()) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('Сервис не ответил вовремя');
    throw e;
  } finally {
    window.clearTimeout(t);
  }
}

// ------------------------------------------------------------------ geocoding (OpenStreetMap Nominatim)

let lastGeocode = 0;
/** Nominatim allows one request per second: calls are queued. Results are cached in the database. */
export async function geocode(query: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 3) return null;
  const cached = await db.geocode.get(q.toLowerCase());
  if (cached) return cached.lat === null || cached.lon === null ? null : { lat: cached.lat, lon: cached.lon, label: cached.label };
  const wait = lastGeocode + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastGeocode = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=ru&q=${encodeURIComponent(q)}`;
  const res = await getJson<Array<{ lat: string; lon: string; display_name: string }>>(url);
  const hit = res[0];
  const row = hit
    ? { q: q.toLowerCase(), lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name, at: new Date().toISOString() }
    : { q: q.toLowerCase(), lat: null, lon: null, label: '', at: new Date().toISOString() };
  await db.geocode.put(row);
  return hit ? { lat: row.lat as number, lon: row.lon as number, label: row.label } : null;
}

// ------------------------------------------------------------------ weather (Open-Meteo)

interface OpenMeteoDaily {
  daily?: { time: string[]; temperature_2m_max: Array<number | null>; temperature_2m_min: Array<number | null>; precipitation_sum: Array<number | null> };
}

const shiftYear = (d: string, years: number) => `${Number(d.slice(0, 4)) + years}${d.slice(4)}`.replace(/-02-29$/, '-02-28');

/**
 * Weather for the dates of a stop: the forecast when the dates are within 15 days,
 * otherwise last year's observations for the same dates ("обычно в эти дни").
 */
export async function weatherFor(lat: number, lon: number, start: string, end: string, today: string): Promise<{ kind: 'forecast' | 'climate'; days: DayWeather[] }> {
  const params = `latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
  const daysAhead = (Date.parse(start) - Date.parse(today)) / 86_400_000;
  const span = Math.min(16, Math.max(1, (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1));
  const endCapped = new Date(Date.parse(start) + (span - 1) * 86_400_000).toISOString().slice(0, 10);
  let kind: 'forecast' | 'climate' = 'forecast';
  let url = `https://api.open-meteo.com/v1/forecast?${params}&start_date=${start}&end_date=${endCapped}`;
  if (daysAhead > 14 || daysAhead < -60) {
    kind = 'climate';
    let years = -1;
    while (shiftYear(endCapped, years) > shiftYear(today, 0) || Date.parse(today) - Date.parse(shiftYear(endCapped, years)) < 7 * 86_400_000) years--;
    url = `https://archive-api.open-meteo.com/v1/archive?${params}&start_date=${shiftYear(start, years)}&end_date=${shiftYear(endCapped, years)}`;
  }
  const r = await getJson<OpenMeteoDaily>(url);
  const d = r.daily;
  if (!d) return { kind, days: [] };
  const days: DayWeather[] = [];
  d.time.forEach((date, i) => {
    const tMax = d.temperature_2m_max[i];
    const tMin = d.temperature_2m_min[i];
    if (tMax == null || tMin == null) return;
    days.push({ date, tMax, tMin, rain: d.precipitation_sum[i] ?? 0 });
  });
  return { kind, days };
}

// ------------------------------------------------------------------ Wikivoyage

export interface WikivoyagePage {
  lang: 'ru' | 'en';
  title: string;
  url: string;
  html: string;
}

async function wvParse(lang: 'ru' | 'en', title: string): Promise<WikivoyagePage | null> {
  const api = `https://${lang}.wikivoyage.org/w/api.php?action=parse&format=json&formatversion=2&origin=*&redirects=1&prop=text&disabletoc=1&page=${encodeURIComponent(title)}`;
  const r = await getJson<{ parse?: { title: string; text: string }; error?: { code: string } }>(api, 20000);
  if (!r.parse) return null;
  if (/disambig|неоднозначн/i.test(r.parse.text.slice(0, 3000)) && r.parse.text.length < 15000) return null;
  return { lang, title: r.parse.title, url: `https://${lang}.wikivoyage.org/wiki/${encodeURIComponent(r.parse.title.replace(/ /g, '_'))}`, html: r.parse.text };
}

async function wvSearch(lang: 'ru' | 'en', q: string): Promise<string | null> {
  const api = `https://${lang}.wikivoyage.org/w/api.php?action=query&list=search&format=json&formatversion=2&origin=*&srlimit=1&srsearch=${encodeURIComponent(q)}`;
  const r = await getJson<{ query?: { search: Array<{ title: string }> } }>(api);
  return r.query?.search[0]?.title ?? null;
}

/** Article about a city: Russian Wikivoyage first, English as a fallback. */
export async function fetchWikivoyage(nameRu: string, nameEn: string, countryRu: string, countryEn: string): Promise<WikivoyagePage | null> {
  const tries: Array<['ru' | 'en', string]> = [['ru', nameRu]];
  if (nameEn) tries.push(['en', nameEn]);
  for (const [lang, title] of tries) {
    const page = await wvParse(lang, title).catch(() => null);
    if (page) return page;
  }
  for (const [lang, q] of [['ru', `${nameRu} ${countryRu}`], ['en', `${nameEn || nameRu} ${countryEn}`]] as Array<['ru' | 'en', string]>) {
    const t = await wvSearch(lang, q).catch(() => null);
    if (t) {
      const page = await wvParse(lang, t).catch(() => null);
      if (page) return page;
    }
  }
  return null;
}
