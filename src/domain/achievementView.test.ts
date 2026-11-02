import { describe, expect, it } from 'vitest';
import { type AchView, collapsedView } from './achievementView';

const v = (id: string, value: number, target: number, ladder?: string): AchView => ({
  id, icon: '', title: id, why: '', tile: '', value, target, done: value >= target, opens: false, rider: false, ...(ladder ? { ladder } : {}),
});

describe('collapsed achievements', () => {
  it('shows what is got and what is started; for a ladder only the next step', () => {
    const list = [v('c5', 5, 5, 'countries'), v('c10', 8, 10, 'countries'), v('c25', 8, 25, 'countries'), v('c100', 8, 100, 'countries'), v('luxury', 1, 3), v('polar', 0, 1)];
    expect(collapsedView(list).map((a) => a.id)).toEqual(['c5', 'c10', 'luxury']);
  });
});
