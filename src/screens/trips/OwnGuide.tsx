import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { useToast } from '../../app/toast';
import { db, store } from '../../app/world';
import type { GuideBlock } from '../../domain/guideBlocks';
import type { Guide, Trip } from '../../domain/model';
import { itemsFromBlocks, OWN_SECTIONS, ownGuideId, ownSections, type OwnItem } from '../../domain/ownGuide';
import { useAttachmentUrl } from '../../ui/files';
import { Icon } from '../../ui/Icon';
import { Field, Flag } from '../../ui/kit';
import { AttachmentField, savePending } from './Attachments';
import type { RouteStop } from './common';
import { FormSheet } from './sections/shared';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Empty own guide of a city, created on the first point. */
function emptyOwn(trip: Trip, r: RouteStop): Guide {
  const now = new Date().toISOString();
  return {
    id: ownGuideId(trip.id, r.stop.cityId),
    kind: 'own',
    tripId: trip.id,
    cityId: r.stop.cityId,
    lang: 'ru',
    title: r.city?.name ?? '',
    url: '',
    sections: [],
    places: [],
    items: [],
    fetchedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function saveOwn(g: Guide) {
  const { createdAt: _c, updatedAt: _u, ...rest } = g;
  void _c;
  void _u;
  await store.saveGuide({ ...rest, fetchedAt: new Date().toISOString() });
}

/**
 * The user's own guide: points by city and section (the same sections as the automatic guide), each with
 * an address line, a description and photos. Saved on the device; the PDF is drawn from it the same way.
 */
export function OwnGuide({ trip, cities, own, wikiBlocks }: { trip: Trip; cities: RouteStop[]; own: Guide[]; wikiBlocks: (cityId: string) => Array<{ key: string; blocks: GuideBlock[] }> }) {
  const toast = useToast();
  const [edit, setEdit] = useState<{ r: RouteStop; item: OwnItem | null } | null>(null);

  const copyAuto = async (r: RouteStop) => {
    const items = itemsFromBlocks(wikiBlocks(r.stop.cityId), newId);
    if (!items.length) return toast('В автоматическом путеводителе нет мест для этого города');
    const g = own.find((x) => x.cityId === r.stop.cityId) ?? emptyOwn(trip, r);
    await saveOwn({ ...g, items: [...g.items, ...items] });
    toast(`Добавлено мест: ${items.length} — отредактируйте и добавьте фото`);
  };

  return (
    <>
      {cities.map((r) => {
        const g = own.find((x) => x.cityId === r.stop.cityId);
        const groups = ownSections(g?.items ?? []);
        const hasAuto = wikiBlocks(r.stop.cityId).some((s) => s.blocks.some((b) => b.kind === 'place'));
        return (
          <article key={r.stop.id} className="card guide-city">
            <header className="guide-city-head">
              {r.city && <Flag id={r.city.countryId} />}
              <h4 className="grow">{r.city?.name}</h4>
            </header>
            {groups.length === 0 && (
              <p className="faint small" style={{ margin: '0 0 6px' }}>
                Добавляйте места, кафе и советы со своими фото и заметками — потом весь путеводитель сохраняется в PDF.
              </p>
            )}
            {groups.map((s) => (
              <section key={s.key} className="guide-sec">
                <div className="guide-sec-head static">
                  <span className="guide-sec-ic" aria-hidden="true">
                    {SECTION_EMOJI[s.key] ?? '•'}
                  </span>
                  <span className="grow strong">{s.title}</span>
                </div>
                <div className="guide-body">
                  {s.items.map((it) => (
                    <OwnItemCard key={it.id} item={it} n={it.n} onEdit={() => setEdit({ r, item: it })} />
                  ))}
                </div>
              </section>
            ))}
            <div className="row wrap" style={{ gap: 8 }}>
              <button type="button" className="btn sm lime" onClick={() => setEdit({ r, item: null })}>
                <Icon name="plus" size={16} /> Добавить пункт
              </button>
              {hasAuto && groups.length === 0 && (
                <button type="button" className="btn sm glass-btn" onClick={() => void copyAuto(r)}>
                  <Icon name="sparkle" size={16} /> Взять места из автоматического
                </button>
              )}
            </div>
          </article>
        );
      })}
      {edit && <OwnItemForm trip={trip} r={edit.r} item={edit.item} guide={own.find((x) => x.cityId === edit.r.stop.cityId) ?? null} onClose={() => setEdit(null)} />}
    </>
  );
}

export const SECTION_EMOJI: Record<string, string> = { intro: '✨', understand: '📖', see: '📍', do: '🎯', eat: '🍽️', drink: '🌙', getaround: '🚌', safe: '🛡️', connect: '📶' };

/** Photos of a point (image attachments only), oldest first. */
export const usePointPhotos = (itemId: string) =>
  useLiveQuery(async () => (await db.attachments.where('ownerId').equals(itemId).toArray()).filter((a) => a.mime.startsWith('image/')).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [itemId], []);

function OwnItemCard({ item, n, onEdit }: { item: OwnItem; n: number; onEdit: () => void }) {
  const photos = usePointPhotos(item.id);
  return (
    <button type="button" className="guide-place own" onClick={onEdit}>
      <span className="guide-num">{n}</span>
      <div className="grow">
        <b>{item.title}</b>
        {item.info && <span className="guide-info">{item.info}</span>}
        {item.text && <p>{item.text}</p>}
        {photos.length > 0 && (
          <div className={`own-photos n${Math.min(photos.length, 3)}`}>
            {photos.slice(0, 3).map((a) => (
              <PointPhoto key={a.id} id={a.id} />
            ))}
          </div>
        )}
      </div>
      <Icon name="edit" size={16} />
    </button>
  );
}

function PointPhoto({ id }: { id: string }) {
  const url = useAttachmentUrl(id);
  return url ? <img src={url} alt="" loading="lazy" /> : <span className="own-photo-ph" />;
}

function OwnItemForm({ trip, r, item, guide, onClose }: { trip: Trip; r: RouteStop; item: OwnItem | null; guide: Guide | null; onClose: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<OwnItem>(() => item ?? { id: newId(), section: 'see', title: '', info: '', text: '' });
  const [pending, setPending] = useState<File[]>([]);
  const set = <K extends keyof OwnItem>(k: K, val: OwnItem[K]) => setV((x) => ({ ...x, [k]: val }));
  return (
    <FormSheet
      title={item ? 'Пункт путеводителя' : `Новый пункт · ${r.city?.name ?? ''}`}
      onClose={onClose}
      canSave={v.title.trim().length > 0}
      onSave={async () => {
        const g = guide ?? emptyOwn(trip, r);
        const clean = { ...v, title: v.title.trim(), info: v.info.trim(), text: v.text.trim() };
        const items = item ? g.items.map((x) => (x.id === item.id ? clean : x)) : [...g.items, clean];
        await saveOwn({ ...g, items });
        await savePending(trip.id, 'guide', clean.id, pending, toast);
      }}
      onDelete={
        item && guide
          ? async () => {
              for (const a of await db.attachments.where('ownerId').equals(item.id).toArray()) await store.deleteAttachment(a.id);
              await saveOwn({ ...guide, items: guide.items.filter((x) => x.id !== item.id) });
            }
          : undefined
      }
    >
      <Field label="Раздел">
        <div className="chips wrap-chips">
          {OWN_SECTIONS.map((s) => (
            <button key={s.key} type="button" className="chip" aria-pressed={v.section === s.key} onClick={() => set('section', s.key)}>
              {SECTION_EMOJI[s.key]} {s.title}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Название">
        <input className="input" value={v.title} onChange={(e) => set('title', e.target.value)} placeholder="Собор, кафе, смотровая…" />
      </Field>
      <Field label="Адрес, телефон, часы">
        <input className="input" value={v.info} onChange={(e) => set('info', e.target.value)} placeholder="ул. Абовяна, 18 · 10:00–20:00" />
      </Field>
      <Field label="Описание">
        <textarea className="textarea" value={v.text} onChange={(e) => set('text', e.target.value)} placeholder="Что посмотреть, что заказать, совет…" />
      </Field>
      <AttachmentField tripId={trip.id} ownerType="guide" ownerId={item ? item.id : null} pending={pending} setPending={setPending} label="Фото" />
    </FormSheet>
  );
}
