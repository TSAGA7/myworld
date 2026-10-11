// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseWikivoyage } from './wikivoyage';

const HTML = `<div class="mw-parser-output">
<p><b>Флоренция</b> — столица Тосканы, один из главных городов итальянского Возрождения и музей под открытым небом.</p>
<figure><img src="x.jpg"></figure>
<div class="mw-heading mw-heading2"><h2 id="Понять">Понять</h2><span class="mw-editsection">[править]</span></div>
<p>История города <a href="/wiki/X">Медичи</a> <script>alert(1)</script>.<sup>[1]</sup></p>
<h2>Как добраться</h2><p>Поездом.</p>
<h2>Достопримечательности</h2>
<ul><li><span class="vcard"><span class="listing-name fn">Галерея Уффици</span><a class="mw-kartographer-maplink" data-lat="43.7678" data-lon="11.2553">1</a> — главный музей.</span></li>
<li><span class="vcard"><b>Понте-Веккьо</b> — старейший мост.</span></li></ul>
<h2>Еда</h2><p onclick="x()">Попробуйте бистеккy.</p>
</div>`;

describe('wikivoyage', () => {
  it('keeps chosen sections, strips unsafe markup, extracts places', () => {
    const { sections, places } = parseWikivoyage(HTML, 'ru');
    expect(sections.map((s) => s.key)).toEqual(['intro', 'understand', 'see', 'eat']);
    const all = sections.map((s) => s.html).join('');
    expect(all).not.toMatch(/script|onclick|href|img|править|\[1\]/);
    expect(all).toContain('Медичи');
    expect(places).toEqual([
      { name: 'Галерея Уффици', kind: 'see', lat: 43.7678, lon: 11.2553 },
      { name: 'Понте-Веккьо', kind: 'see', lat: null, lon: null },
    ]);
  });
});
