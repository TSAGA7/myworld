import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useToast } from '../../app/toast';
import { db, store, useWorld } from '../../app/world';
import { formatDate, formatRange } from '../../domain/dates';
import { guideBlocks, type GuideBlock } from '../../domain/guideBlocks';
import type { Guide, Trip } from '../../domain/model';
import { fetchWikivoyage } from '../../geo/online';
import { COUNTRY_BY_ID } from '../../geo/reference';
import { parseWikivoyage } from '../../geo/wikivoyage';
import { Icon } from '../../ui/Icon';
import { Empty, Flag } from '../../ui/kit';
import { MODE_LABEL, type RouteStop } from './common';

/** Emoji of each guide section — the same in the app and in the PDF. */
const SECTION_ICON: Record<string, string> = { intro: '✨', understand: '📖', see: '📍', do: '🎯', eat: '🍽️', drink: '🌙', getaround: '🚌', safe: '🛡️', connect: '📶' };

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
  const { settings } = useWorld();
  const [pdf, setPdf] = useState<{ kind: 'idle' } | { kind: 'busy'; page: number } | { kind: 'ready'; file: File; pages: number }>({ kind: 'idle' });
  // Blocks of every saved section, parsed once per guide version.
  const parsed = useMemo(() => new Map(guides.flatMap((g) => g.sections.map((s) => [`${g.id}:${s.key}`, guideBlocks(s.html)] as const))), [guides]);
  const blocksOf = (g: Guide, key: string): GuideBlock[] => parsed.get(`${g.id}:${key}`) ?? [];
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

  const makePdf = async () => {
    setPdf({ kind: 'busy', page: 0 });
    try {
      const { renderGuidePdf } = await import('./guidePdf');
      const cities = unique.flatMap((r) => {
        const g = guides.find((x) => x.cityId === r.stop.cityId);
        if (!g || !r.city) return [];
        return [
          {
            name: r.city.name,
            countryId: r.city.countryId,
            source: `По материалам Wikivoyage «${g.title}» (CC BY-SA), ${g.url}. Обновлено ${formatDate(g.fetchedAt.slice(0, 10))}.`,
            sections: g.sections.map((s) => ({ icon: SECTION_ICON[s.key] ?? '•', title: s.title, blocks: blocksOf(g, s.key) })),
          },
        ];
      });
      const { blob, pages } = await renderGuidePdf(
        {
          tripTitle: trip.title,
          dates: trip.startDate ? formatRange(trip.startDate, trip.endDate) : '',
          author: settings.name,
          days: days.map((d, i) => ({ label: `День ${i + 1} · ${formatDate(d.date, false)}`, city: d.city, items: d.items.map((it) => ({ time: it.time, text: it.text })) })),
          cities,
        },
        (page) => setPdf({ kind: 'busy', page }),
      );
      const name = `MY WORLD — ${trip.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'путеводитель'}.pdf`;
      setPdf({ kind: 'ready', file: new File([blob], name, { type: 'application/pdf' }), pages });
    } catch (e) {
      setPdf({ kind: 'idle' });
      toast(`Не удалось собрать PDF: ${e instanceof Error ? e.message : e}`);
    }
  };

  /** Called right from the tap: iOS shows the share sheet only for a user gesture (Files, Telegram, AirDrop…). */
  const sharePdf = async (file: File) => {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: file.name });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    const href = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = href;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
  };

  return (
    <section className="stack guide">
      <div className="section-title">
        <h3 className="h2">Путеводитель</h3>
        {guides.length > 0 && (
          <button type="button" className="btn sm lime" disabled={pdf.kind === 'busy'} onClick={() => void makePdf()}>
            {pdf.kind === 'busy' ? <span className="spinner sm" /> : <Icon name="download" size={16} />} {pdf.kind === 'busy' ? `Страница ${pdf.page}` : 'Сохранить PDF'}
          </button>
        )}
      </div>
      {pdf.kind === 'ready' && (
        <div className="card guide-pdf-ready">
          <span className="guide-pdf-ic" aria-hidden="true">📄</span>
          <span className="grow">
            <b className="block">PDF готов</b>
            <span className="muted small">
              {pdf.pages} стр. · {(pdf.file.size / 1024 / 1024).toFixed(1)} МБ
            </span>
          </span>
          <button type="button" className="btn sm dark" onClick={() => void sharePdf(pdf.file)}>
            <Icon name="share" size={16} /> Сохранить
          </button>
        </div>
      )}

      {days.length > 0 && (
        <div className="card stack">
          <h4 className="guide-title">🗓️ План по дням</h4>
          <ol className="day-plan">
            {days.map((d, i) => (
              <li key={d.date}>
                <div className="row between">
                  <b className="row" style={{ gap: 8 }}>
                    <span className="guide-num">{i + 1}</span> {formatDate(d.date, false)}
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
        <button type="button" className="btn glass-btn block" disabled={!!busy} onClick={() => void build()}>
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
        <p className="faint small" style={{ margin: 0 }}>
          Для каждого города соберутся «что посмотреть», еда, транспорт и безопасность. Нужен интернет один раз — потом всё доступно офлайн.
        </p>
      )}

      {unique.map((r) => {
        const g = guides.find((x) => x.cityId === r.stop.cityId);
        if (!g) return null;
        return (
          <article key={g.id} className="card guide-city">
            <header className="guide-city-head">
              {r.city && <Flag id={r.city.countryId} />}
              <h4 className="grow">{r.city?.name}</h4>
              {g.lang === 'en' && <span className="pill">англ.</span>}
            </header>
            {g.sections.map((s) => {
              const key = `${g.id}:${s.key}`;
              const isOpen = open[key] ?? (s.key === 'intro' || s.key === 'see');
              return (
                <section key={s.key} className="guide-sec">
                  <button type="button" className="guide-sec-head" aria-expanded={isOpen} onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}>
                    <span className="guide-sec-ic" aria-hidden="true">
                      {SECTION_ICON[s.key] ?? '•'}
                    </span>
                    <span className="grow strong">{s.title}</span>
                    <Icon name={isOpen ? 'chevronUp' : 'chevronDown'} size={18} />
                  </button>
                  {isOpen && <GuideBody blocks={blocksOf(g, s.key)} />}
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

/** One guide section as cards: paragraphs, sub-headings, bullet items and numbered places. */
function GuideBody({ blocks }: { blocks: GuideBlock[] }) {
  return (
    <div className="guide-body">
      {blocks.map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>{b.text}</p>
        ) : b.kind === 'h' ? (
          <h5 key={i} className="guide-h">
            {b.text}
          </h5>
        ) : b.kind === 'li' ? (
          <div key={i} className="guide-li">
            {b.text}
          </div>
        ) : (
          <div key={i} className="guide-place">
            <span className="guide-num">{b.n ?? '•'}</span>
            <div className="grow">
              <b>{b.name}</b>
              {b.info && <span className="guide-info">{b.info}</span>}
              {b.text && <p>{b.text}</p>}
            </div>
          </div>
        ),
      )}
    </div>
  );
}
