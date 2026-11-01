import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { markCity, markCountry } from './actions';
import { db, store } from './world';

describe('«Учитывать путешествия»', () => {
  it('off: nothing new becomes visited, plans still work, history stays; on again: marks work', async () => {
    const toasts: string[] = [];
    const toast = (t: string) => void toasts.push(t);
    await markCountry(toast, 'IT', 'visited');
    await store.setSetting('travelTracking', false);
    await markCountry(toast, 'FR', 'visited');
    await markCity(toast, { id: 'ne:1', name: 'Рим', nameEn: '', countryId: 'IT', lat: 41.9, lon: 12.5, region: '', source: 'catalog' }, 'visited');
    await markCountry(toast, 'ES', 'planned');
    expect((await db.visits.toArray()).map((v) => v.countryId)).toEqual(['IT']);
    expect((await db.plans.toArray()).map((v) => v.countryId)).toEqual(['ES']);
    expect(toasts.filter((t) => t.startsWith('Учёт путешествий выключен'))).toHaveLength(2);
    await store.setSetting('travelTracking', true);
    await markCountry(toast, 'FR', 'visited');
    expect((await db.visits.toArray()).map((v) => v.countryId).sort()).toEqual(['FR', 'IT']);
  });
});
