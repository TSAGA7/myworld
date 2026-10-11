import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useToast } from '../../app/toast';
import { db, store } from '../../app/world';
import { formatDate } from '../../domain/dates';
import type { Trip } from '../../domain/model';
import { fetchWikivoyage } from '../../geo/online';
import { COUNTRY_BY_ID } from '../../geo/reference';
import { parseWikivoyage } from '../../geo/wikivoyage';
import { Icon } from '../../ui/Icon';
import { Empty } from '../../ui/kit';
import { MODE_LABEL, type RouteStop } from './common';

const addDays = (d: string, n: number) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y as number, (m as number) - 1, (day as number) + n)).toISOString().slice(0, 10);
};

/**
 * Travel guide for the trip: a day-by-day plan from the user's own bookings plus a city guide per stop from
 * Wikivoyage, saved on the device for offline reading and printable to PDF.
 */
export function GuideSection({ trip, route }: { trip: Trip; route: RouteStop[] }) {
  const toast = useToast();
  const guides = useLiveQuery(() => db.guides.where('tripId').equals(trip.id).toArray(), [trip.id], []);
  const records = useLiveQuery(
    async () => ({
      transport: await db.transport.where('tripId').equals(trip.id).toArray(),
      stays: await db.stays.where('tripId').equals(trip.id).toArray(),
      bookings: await db.bookings.where('tripId').equals(trip.id).toArray(),
    }),
    [trip.id],
    { transport: [], stays: [], bookings: [] },
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const unique = route.filter((r, i, a) => r.city && a.findIndex((x) => x.stop.cityId === r.stop.cityId) === i);

  const build = async () => {
    let ok = 0;
    const missing: string[] = [];
    for (const r of unique) {
      const c = r.city;
      if (!c) continue;
      setBusy(c.name);
      try {
        const country = COUNTRY_BY_ID.get(c.countryId);
        const page = await fetchWikivoyage(c.name, c.nameEn, country?.ru ?? '', country?.en ?? '');
        if (!page) {
          missing.push(c.name);
          continue;
        }
        const { sections, places } = parseWikivoyage(page.html, page.lang);
        await store.saveGuide({ id: `${trip.id}:${c.id}`, tripId: trip.id, cityId: c.id, lang: page.lang, title: page.title, url: page.url, sections, places, fetchedAt: new Date().toISOString() });
        ok++;
      } catch (e) {
        toast(`${c.name}: ${e instanceof Error ? e.message : e}`);
        if (!navigator.onLine) break;
      }
    }
    setBusy(null);
    toast(ok ? `Путеводитель собран: ${ok} ${ok === 1 ? 'город' : 'города'}${missing.length ? `. Нет статьи: ${missing.join(', ')}` : ''}` : missing.length ? `Не нашлось статей: ${missing.join(', ')}` : 'Не удалось собрать путеводитель');
  };

  // Day-by-day plan from the trip's own data.
  const days: Array<{ date: string; city: string; items: Array<{ icon: 'plane' | 'bed' | 'ticket'; text: string; time: string | null }> }> = [];
  if (trip.startDate && trip.endDate) {
    for (let d = trip.startDate, i = 0; d <= trip.endDate && i < 60; d = addDays(d, 1), i++) {
      const stop = route.find((r) => r.stop.startDate && r.stop.startDate <= d && (r.stop.endDate ?? r.stop.startDate) >= d);
      const items: (typeof days)[number]['items'] = [];
      for (const t of records.transport.filter((x) => x.departDate === d))
        items.push({ icon: 'plane', time: t.departTime, text: `${MODE_LABEL[t.mode]} ${[t.from, t.to].filter(Boolean).join(' → ')}${t.number ? `, ${t.number}` : ''}` });
      for (const s of records.stays.filter((x) => x.checkIn === d)) items.push({ icon: 'bed', time: null, text: `Заезд: ${s.name}${s.address ? `, ${s.address}` : ''}` });
      for (const s of records.stays.filter((x) => x.checkOut === d)) items.push({ icon: 'bed', time: null, text: `Выезд: ${s.name}` });
      for (const b of records.bookings.filter((x) => x.date === d)) items.push({ icon: 'ticket', time: b.time, text: `${b.title}${b.place ? `, ${b.place}` : ''}` });
      items.sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
      days.push({ date: d, city: stop?.city?.name ?? '', items });
    }
  }

  return (
    <section className="stack guide">
      <div className="section-title no-print">
        <h3 className="h2">Путеводитель</h3>
        {guides.length > 0 && (
          <button type="button" className="btn sm glass-btn" onClick={() => window.print()}>
            <Icon name="download" size={16} /> PDF
          </button>
        )}
      </div>

      <div className="guide-print-title print-only">
        <h1>{trip.title}</h1>
      </div>

      {days.length > 0 && (
        <div className="card stack">
          <h4 className="h3">План по дням</h4>
          <ol className="day-plan">
            {days.map((d, i) => (
              <li key={d.date}>
                <div className="row between">
                  <b>
                    День {i + 1} · {formatDate(d.date, false)}
                  </b>
                  {d.city && <span className="muted small">{d.city}</span>}
                </div>
                {d.items.length ? (
                  d.items.map((it, k) => (
                    <div key={k} className="row small plan-item">
                      <Icon name={it.icon} size={15} />
                      {it.time && <span className="num strong">{it.time}</span>}
                      <span className="grow">{it.text}</span>
                    </div>
                  ))
                ) : (
                  <span className="faint small">Свободный день</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {unique.length === 0 ? (
        <Empty icon="book" title="Нет городов" text="Добавьте города в маршрут — для каждого соберётся мини-путеводитель." />
      ) : (
        <button type="button" className="btn lime block no-print" disabled={!!busy} onClick={() => void build()}>
          {busy ? (
            <>
              <span className="spinner" /> {busy}…
            </>
          ) : (
            <>
              <Icon name="book" size={18} /> {guides.length ? 'Обновить путеводитель' : 'Собрать путеводитель'}
            </>
          )}
        </button>
      )}
      {guides.length === 0 && unique.length > 0 && (
        <p className="faint small no-print" style={{ margin: 0 }}>
          Для каждого города соберутся «что посмотреть», еда, транспорт и безопасность. Нужен интернет один раз — потом всё доступно офлайн.
        </p>
      )}

      {unique.map((r) => {
        const g = guides.find((x) => x.cityId === r.stop.cityId);
        if (!g) return null;
        return (
          <article key={g.id} className="card guide-city">
            <header className="row between">
              <h4 className="h2">{r.city?.name}</h4>
              <span className="faint tiny">{g.lang === 'en' ? 'на английском' : ''}</span>
            </header>
            {g.sections.map((s) => {
              const key = `${g.id}:${s.key}`;
              const isOpen = open[key] ?? (s.key === 'intro' || s.key === 'see');
              return (
                <section key={s.key} className="guide-sec">
                  <button type="button" className="guide-sec-head no-print" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}>
                    <span className="grow strong">{s.title}</span>
                    <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={18} />
                  </button>
                  <h5 className="print-only">{s.title}</h5>
                  {/* Sanitised by parseWikivoyage: allow-listed tags only, no attributes. */}
                  <div className={`guide-body ${isOpen ? '' : 'collapsed'}`} dangerouslySetInnerHTML={{ __html: s.html }} />
                </section>
              );
            })}
            {g.places.some((p) => p.lat !== null) && (
              <div className="stack tight">
                <span className="muted small strong">Места на карте</span>
                <div className="chips wrap-chips">
                  {g.places
                    .filter((p) => p.lat !== null && p.lon !== null)
                    .slice(0, 20)
                    .map((p) => (
                      <a key={p.name} className="chip" href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`} target="_blank" rel="noopener noreferrer">
                        <Icon name="pin" size={14} /> {p.name}
                      </a>
                    ))}
                </div>
              </div>
            )}
            <p className="faint tiny" style={{ margin: 0 }}>
              По материалам{' '}
              <a href={g.url} target="_blank" rel="noopener noreferrer">
                Wikivoyage «{g.title}»
              </a>
              , лицензия CC BY-SA. Обновлено {formatDate(g.fetchedAt.slice(0, 10))}.
            </p>
          </article>
        );
      })}
    </section>
  );
}
