import { describe, expect, it } from 'vitest';
import { isOwn, itemsFromBlocks, ownGuideId, ownSections } from './ownGuide';

describe('own guide', () => {
  it('groups points by section in the standard order and numbers them', () => {
    const items = [
      { id: 'a', section: 'eat', title: 'Кафе', info: '', text: '' },
      { id: 'b', section: 'see', title: 'Площадь', info: '', text: '' },
      { id: 'c', section: 'see', title: 'Музей', info: 'ул. Абовяна', text: 'Красиво' },
    ];
    expect(ownSections(items).map((s) => [s.key, s.items.map((i) => `${i.n} ${i.title}`)])).toEqual([
      ['see', ['1 Площадь', '2 Музей']],
      ['eat', ['1 Кафе']],
    ]);
  });
  it('copies places of the automatic guide and recognises own records', () => {
    let n = 0;
    const items = itemsFromBlocks([{ key: 'see', blocks: [{ kind: 'p', text: 'x' }, { kind: 'place', n: 1, name: 'Собор', info: 'ул. Кочара', text: 'Главная церковь' }] }], () => `i${++n}`);
    expect(items).toEqual([{ id: 'i1', section: 'see', title: 'Собор', info: 'ул. Кочара', text: 'Главная церковь' }]);
    expect(ownGuideId('t', 'ne:1')).toBe('t:own:ne:1');
    expect(isOwn({ id: 't:own:ne:1', kind: 'wiki' })).toBe(true);
    expect(isOwn({ id: 't:ne:1', kind: 'wiki' })).toBe(false);
  });
});
