import { type HobbyKind, type Place, placeTitle } from '../domain/hobby';
import { countryName } from '../geo/reference';
import { store } from './world';

type Toast = (text: string, action?: { label: string; run: () => void }) => void;
const ids = (p: Place): string[] => [p.id, ...('alt' in p ? p.alt : [])];

/** «Был здесь» on a resort / spot. With travel tracking on, a new country is marked too (and said so). */
export async function markPlaceVisited(toast: Toast, kind: HobbyKind, p: Place, opts: { travelTracking: boolean }): Promise<void> {
  try {
    const { countryAdded } = await store.markHobby('visit', kind, ids(p), opts.travelTracking ? p.countryId : null);
    const undo = async () => {
      await store.unmarkHobby('visit', kind, ids(p));
      if (countryAdded) await store.unmarkCountry(p.countryId, 'visited', false);
    };
    toast(countryAdded ? `${placeTitle(p)} — отмечено. ${countryName(p.countryId)} тоже в посещённых странах` : `${placeTitle(p)} — отмечено`, {
      label: 'Отменить',
      run: () => void undo(),
    });
  } catch (e) {
    toast(`Не удалось отметить: ${e instanceof Error ? e.message : e}`);
  }
}

export async function unmarkPlaceVisited(toast: Toast, kind: HobbyKind, p: Place): Promise<void> {
  try {
    const removed = await store.unmarkHobby('visit', kind, ids(p));
    toast(`${placeTitle(p)} — отметка снята`, { label: 'Вернуть', run: () => void store.restoreHobby(removed) });
  } catch (e) {
    toast(`Не удалось снять отметку: ${e instanceof Error ? e.message : e}`);
  }
}

export async function toggleFavorite(kind: HobbyKind, p: Place, on: boolean): Promise<void> {
  if (on) await store.markHobby('fav', kind, ids(p));
  else await store.unmarkHobby('fav', kind, ids(p));
}

const HERE_MS = 7 * 24 * 3_600_000;
const until = () => new Date(Date.now() + HERE_MS).toISOString();

/** «Сейчас тут»: the resort is marked visited and its notices are on for a week (then the app asks again). */
export async function startHere(toast: Toast, p: Place, opts: { travelTracking: boolean; visited: boolean }): Promise<void> {
  try {
    await store.setHere(p.id, until());
    await store.setFlag('mute', 'resort', ids(p), false);
    if (!opts.visited) await store.markHobby('visit', 'resort', ids(p), opts.travelTracking ? p.countryId : null);
    toast(`${placeTitle(p)}: вы здесь. Оперативные сообщения курорта — в «Моём мире»`);
  } catch (e) {
    toast(`Не удалось сохранить: ${e instanceof Error ? e.message : e}`);
  }
}

/** Another week at the resort. */
export const extendHere = (p: { id: string }): Promise<void> => store.setHere(p.id, until());

/** «Завершить пребывание»: notices go off (unless switched on by hand); the visit stays in the history. */
export async function endHere(p: Place): Promise<void> {
  await store.setFlag('here', 'resort', ids(p), false);
  await store.setFlag('mute', 'resort', ids(p), false);
}

export const setNotify = (p: Place, on: boolean): Promise<void> => store.setFlag('notify', 'resort', ids(p), on);
export const setMute = (p: Place, on: boolean): Promise<void> => store.setFlag('mute', 'resort', ids(p), on);
