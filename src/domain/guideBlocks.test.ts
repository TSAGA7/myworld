// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { guideBlocks, splitPlace } from './guideBlocks';

describe('guide blocks', () => {
  it('splits an old run-on listing paragraph into numbered places', () => {
    const html =
      '<p>1 Ансамбль площади Республики. Главная площадь города и страны. Площадь особенно эффектно выглядит вечером.2 Кинотеатр «Москва» , ул. Абовяна, 18. (010) 521210. Один из лучших примеров армянского неоклассицизма.3 Голубая мечеть , пр. Маштоца, 12. Построенная в 1766 году.</p>';
    const b = guideBlocks(html);
    expect(b.map((x) => (x.kind === 'place' ? [x.n, x.name, x.info] : x.kind))).toEqual([
      [1, 'Ансамбль площади Республики', ''],
      [2, 'Кинотеатр «Москва»', 'ул. Абовяна, 18 · (010) 521210'],
      [3, 'Голубая мечеть', 'пр. Маштоца, 12'],
    ]);
    expect(b[1]).toMatchObject({ text: 'Один из лучших примеров армянского неоклассицизма.' });
  });

  it('keeps paragraphs, headings and list items; listings in lists become places', () => {
    const b = guideBlocks('<p>Город у реки.</p><h4>Метро</h4><ul><li>Билет стоит 100 драм</li><li>Галерея Уффици — главный музей.</li></ul>');
    expect(b).toEqual([
      { kind: 'p', text: 'Город у реки.' },
      { kind: 'h', text: 'Метро' },
      { kind: 'li', text: 'Билет стоит 100 драм' },
      { kind: 'place', n: 1, name: 'Галерея Уффици', info: '', text: 'главный музей.' },
    ]);
  });

  it('splits a single place', () => {
    expect(splitPlace('Собор Григория Просветителя, ул. Ерванда Кочара. Главная церковь города.', 4)).toEqual({ kind: 'place', n: 4, name: 'Собор Григория Просветителя', info: 'ул. Ерванда Кочара', text: 'Главная церковь города.' });
  });
});
