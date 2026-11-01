import { GUIDE_SECTIONS } from '../geo/wikivoyage';
import type { GuideBlock } from './guideBlocks';
import type { Guide } from './model';

export type OwnItem = Guide['items'][number];

/** Sections the user can fill, in the same order and with the same names as the automatic guide. */
export const OWN_SECTIONS: ReadonlyArray<{ key: string; title: string }> = [{ key: 'intro', title: 'Коротко' }, ...GUIDE_SECTIONS.map(({ key, title }) => ({ key, title }))];

export const ownGuideId = (tripId: string, cityId: string) => `${tripId}:own:${cityId}`;
export const isOwn = (g: Pick<Guide, 'kind' | 'id'>): boolean => g.kind === 'own' || g.id.includes(':own:');

/** The user's points grouped by section, sections in the standard order, points numbered within a section. */
export function ownSections(items: readonly OwnItem[]): Array<{ key: string; title: string; items: Array<OwnItem & { n: number }> }> {
  return OWN_SECTIONS.map((s) => ({ ...s, items: items.filter((i) => i.section === s.key).map((i, k) => ({ ...i, n: k + 1 })) })).filter((s) => s.items.length > 0);
}

/** Starting point for an own guide: the places of the automatic one (names, addresses, descriptions), ready to edit and illustrate. */
export function itemsFromBlocks(sections: ReadonlyArray<{ key: string; blocks: GuideBlock[] }>, newId: () => string): OwnItem[] {
  const out: OwnItem[] = [];
  for (const s of sections) {
    for (const b of s.blocks) {
      if (b.kind === 'place') out.push({ id: newId(), section: s.key, title: b.name, info: b.info, text: b.text });
    }
  }
  return out;
}
