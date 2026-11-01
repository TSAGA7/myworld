import { type FeedHobby, SOURCES, STORY_SOURCES } from './sources.ts';

export type { FeedHobby };

/** What the reader wants in the feed: hobbies on, sport news without a hobby, hidden sources. */
export interface FeedPrefs {
  rider: boolean;
  surf: boolean;
  /** Settings → «Спортивные новости»: ski and surf news even without the hobby. */
  sportNews: boolean;
  hidden: readonly string[];
}

const HOBBY_OF = new Map<string, FeedHobby>([...SOURCES, ...STORY_SOURCES].flatMap((s) => (s.hobby ? [[s.id, s.hobby] as const] : [])));
export const hobbyOfSource = (sourceId: string): FeedHobby | null => HOBBY_OF.get(sourceId) ?? null;

/** A source is shown unless the reader hid it, or it is a sport source and its hobby is off (and sport news are off). */
export function sourceVisible(sourceId: string, p: FeedPrefs): boolean {
  if (p.hidden.includes(sourceId)) return false;
  const h = hobbyOfSource(sourceId);
  if (!h) return true;
  return p.sportNews || (h === 'rider' ? p.rider : p.surf);
}

/** Source of a story/news id "<sourceId>:<post>". */
export const sourceOfId = (id: string): string => id.slice(0, id.indexOf(':') < 0 ? id.length : id.indexOf(':'));

/** «Интересное»: stories of the reader's hobbies first, then the rest in the editor's order; hidden ones are dropped. */
export function orderStories<T extends { storyIds: readonly string[] }>(items: readonly T[], p: FeedPrefs): T[] {
  const visible = items.filter((s) => s.storyIds.some((id) => sourceVisible(sourceOfId(id), p)));
  const mine = (s: T) => s.storyIds.some((id) => {
    const h = hobbyOfSource(sourceOfId(id));
    return h ? (h === 'rider' ? p.rider : p.surf) : false;
  });
  return [...visible.filter(mine), ...visible.filter((s) => !mine(s))];
}
