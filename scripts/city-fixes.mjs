// Hand fixes for public/data/cities.tsv: GeoNames gives many resort towns a clumsy or missing Russian name
// («Кан» for Cannes, «Елч» for Elche, plain «Altea»), and some places people visit are not separate GeoNames
// cities at all (Monte-Carlo is a quarter of Monaco). build_world.mjs applies these after a rebuild; running this
// file applies them to the current cities.tsv in place. Idempotent.
//
// Row columns: id ru en country lat lon pop region flags aliases (aliases: «|»-separated, searched but not shown).
//
// Usage: node scripts/city-fixes.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** id → [Russian name, ...other names people type]. */
export const RENAME = {
  // Испания
  'gn:2518559': ['Эльче', 'Элче', 'Elx'],
  'gn:2510253': ['Торревьеха', 'Торревиеха'],
  'gn:2521804': ['Альтеа'],
  'gn:2520496': ['Кальпе', 'Кальп', 'Calpe'],
  'gn:2513076': ['Ориуэла', 'Ориуела'],
  'gn:2517816': ['Эстепона'],
  'gn:2510281': ['Торремолинос'],
  'gn:2517595': ['Фуэнхирола', 'Фуенхирола'],
  'gn:2518878': ['Дения', 'Dénia'],
  'gn:2509588': ['Вильяхойоса', 'Ла-Вила-Жойоса', 'La Vila Joiosa'],
  'gn:2516336': ['Хавеа', 'Хабеа', 'Хабиа', 'Xàbia', 'Jávea'],
  'gn:2511247': ['Сан-Педро-дель-Пинатар'],
  'gn:2513240': ['Нерха'],
  'gn:2516902': ['Гуардамар-дель-Сегура'],
  'gn:3107661': ['Тосса-де-Мар'],
  'gn:3121456': ['Жирона', 'Херона', 'Жерона'],
  'gn:2517367': ['Гандия'],
  'gn:3110986': ['Салоу'],
  // Франция
  'gn:3028808': ['Канны', 'Канн'],
  'gn:2994497': ['Ментон', 'Ментона'],
  'gn:3017253': ['Фрежюс', 'Фрежус'],
  'gn:3019174': ['Эз', 'Эз-Village'],
  'gn:3029227': ['Кань-сюр-Мер'],
  'gn:3004871': ['Ле-Канне'],
  'gn:3034041': ['Босолей'],
  'gn:3028742': ['Кап-д’Ай', 'Кап-дАй'],
  'gn:3014856': ['Грас', 'Грасс'],
  'gn:3037456': ['Антиб', 'Жуан-ле-Пен'],
  // Италия, Хорватия, Турция, Кипр
  'gn:3167777': ['Сан-Ремо', 'Санремо', 'Sanremo'],
  'gn:3191518': ['Ровинь'],
  'gn:324190': ['Аланья', 'Алания'],
  'ne:1159146007': ['Лимасол', 'Лимассол'],
  'gn:146748': ['Айя-Напа', 'Агия-Напа'],
  // Лихтенштейн, Сан-Марино, Андорра
  'gn:3042073': ['Бальцерс'],
  'gn:3042068': ['Эшен'],
  'gn:3042055': ['Маурен'],
  'gn:3042033': ['Тризенберг'],
  'gn:3042037': ['Шелленберг'],
  'gn:3177542': ['Доманьяно'],
  'gn:3183500': ['Аквавива'],
  'gn:3038999': ['Сольдеу'],
  'gn:3040141': ['Ла-Альдоса'],
  // Россия: GeoNames ошибся, а латиница не даёт правильного написания
  'gn:526480': ['Минеральные Воды', 'Минводы'],
  'gn:523655': ['Надтеречное'],
  'gn:797241': ['Восточный'],
  'ne:1159137047': ['Северск'],
  'gn:536206': ['Юбилейный'],
  'gn:694423': ['Севастополь', 'Акъяр'],
  // Монако, Ватикан
  'ne:1159149077': ['Монако', 'Монако-Вилль', 'Monaco-Ville'],
  'ne:1159127243': ['Ватикан', 'Vatican'],
};

/** Places missing from GeoNames as cities: [id, ru, en, country, lat, lon, pop, region, flags, aliases]. */
export const EXTRA = [
  ['x:mc-monte-carlo', 'Монте-Карло', 'Monte-Carlo', 'MC', '43.7397', '7.4270', 3500, 'MC-0', 0, 'Монте Карло|Monte Carlo'],
  ['x:mc-la-condamine', 'Ла-Кондамин', 'La Condamine', 'MC', '43.7347', '7.4197', 3400, 'MC-0', 0, 'Кондамин'],
  ['x:mc-fontvieille', 'Фонвьей', 'Fontvieille', 'MC', '43.7283', '7.4147', 3600, 'MC-0', 0, 'Фонтвьей'],
  ['x:mc-moneghetti', 'Монегетти', 'Moneghetti', 'MC', '43.7364', '7.4153', 3000, 'MC-0', 0, ''],
  ['x:mc-larvotto', 'Ларвотто', 'Larvotto', 'MC', '43.7450', '7.4320', 900, 'MC-0', 0, ''],
];

// GeoNames spells a leading Latin «E» as «Е» (Ел Монте, Естепона); in Russian it is «Э». Countries whose own
// alphabet is Cyrillic keep theirs (Елин Пелин).
const CYRILLIC = new Set(['RU', 'UA', 'BY', 'BG', 'RS', 'MK', 'KZ', 'KG', 'MN', 'TJ', 'ME', 'BA']);


// GeoNames sometimes picks the wrong «Russian» alternate name for a Russian town: a typo («Анаапа»), another
// language («Дамадзедава», «Къруукъуэ»), an old or a neighbour's name («Благовещенское» for Pushkin). Its Latin
// name for Russia is a romanization of the real Russian one, so when the two disagree, the Latin name spelled back
// in Cyrillic wins and the old one stays searchable.
const TO_RU = [
  [/[’'ʹ]/g, 'ь'], [/["ʺ”]/g, 'ъ'], [/tsk/g, 'тск'],
  [/shch/g, 'щ'], [/zh/g, 'ж'], [/kh/g, 'х'], [/ts/g, 'ц'], [/ch/g, 'ч'], [/sh/g, 'ш'],
  [/yye\b/g, 'ые'], [/iy\b/g, 'ий'], [/yy\b/g, 'ый'], [/oy\b/g, 'ой'], [/ay\b/g, 'ай'], [/ey\b/g, 'ей'],
  [/sky\b/g, 'ский'], [/([^aeiouy])ny\b/g, '$1ный'], [/yu/g, 'ю'], [/ya/g, 'я'], [/yo/g, 'ё'], [/(^|[\s-]|[aeiouyьъ])ye/g, '$1е'], [/(^|[\s-])e/g, '$1э'], [/([aeiou])y/g, '$1й'],
];
const LETTER = { a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', z: 'з', i: 'и', y: 'ы', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у', f: 'ф', c: 'к', h: 'х', w: 'в', x: 'кс', j: 'й', q: 'к' };
/** «Novoural’sk» → «Новоуральск», «Ust’-Dzheguta» → «Усть-Джегута». */
export function romanToRussian(en) {
  let s = en.toLowerCase().replace(/ë/g, 'ё').normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
  for (const [re, to] of TO_RU) s = s.replace(re, to);
  s = s.replace(/[a-z]/g, (ch) => LETTER[ch] ?? ch);
  return s.replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase()).replace(/-(На|Над|Под|Де|Дель|Ла)-/g, (m) => m.toLowerCase());
}
const FROM_RU = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ы: 'y', э: 'e', ю: 'yu', я: 'ya' };
const latinKey = (s) => [...s.toLowerCase()].map((ch) => FROM_RU[ch] ?? ch).join('').normalize('NFD').replace(/[^a-z]/g, '');
function similarity(a, b) {
  if (!a || !b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}
/**
 * Key for comparing a Russian name with its BGN romanization: «Мытищи» and «Mytishchi» give the same key,
 * «Митишчи» (a Serbian-style spelling GeoNames sometimes picks) does not.
 */
const bgnKey = (s) =>
  latinKey(s)
    .replace(/y([eo])/g, '$1')
    .replace(/j/g, 'y');

/**
 * Russian name for a Russian GeoNames place whose stored name does not spell its Latin (BGN) name — «Митишчи» for
 * Mytishchi, «Анаапа», «Дамадзедава», «Акъяр» — else null. The Latin name spelled back in Cyrillic wins.
 */
const SUSPECT = /тс(?!к)|шч|й[аоуэ]/i;
// Old names that are right while their Latin name is a loose or foreign spelling.
const KEEP = new Set(['gn:540771', 'gn:549741', 'gn:12041452', 'gn:519016', 'gn:535531']);
export function russianFix(ru, en) {
  if (!en || /["“”.]/.test(en) || !/^[\x20-\u024f’ʹʺ”\s-]+$/.test(en)) return null;
  const fixed = romanToRussian(en);
  // «Нов.Бурасы», «Красн.Четаи»: GeoNames abbreviations, the full Latin name is the real one.
  if (/[А-Яа-яё]\.\s?[А-Я]/.test(ru) && !/\./.test(en) && !UNRUSSIAN.test(fixed)) return fixed;
  // Same key, but spelled letter by letter from Latin: «Одинтсово» (ts → тс, not ц), «Шчёлково», «Майак».
  if (bgnKey(ru) === bgnKey(en)) return SUSPECT.test(ru) && !SUSPECT.test(fixed) ? fixed : null;
  if (fixed === ru || bgnKey(fixed) !== bgnKey(en) || UNRUSSIAN.test(fixed)) return null;
  // «Чёрное» vs a Latin «Chornoye», «Солнечный» vs «Solnechniy»: a proper Russian ending or ё that the new spelling
  // would lose means the old name was right and the Latin one is loose.
  if (/ё/.test(ru) && !/ё/.test(fixed)) return null;
  const ow = ru.split(/[\s-]+/);
  const nw = fixed.split(/[\s-]+/);
  const keepsEnds = ow.length === nw.length && ow.every((w, i) => {
    const end = w.match(/(ый|ий|ой|ое|ая|ые|ово|ево|ино|ск)$/)?.[1];
    return !end || (nw[i] ?? '').endsWith(end);
  });
  if (!keepsEnds && !SUSPECT.test(ru) && ow.length === nw.length) return null;
  return fixed;
}
// Letter clusters Russian names do not have; a spelling with them came from a loose Latin name.
const UNRUSSIAN = /иа(?=[\s-]|$)|тз|ыи|кы(?=[\s-]|$)|[^аеиоуыэюяй]ны(?=[\s-]|$)|сч/;

// Russian towns with their official names (scripts/data/ru-towns.tsv, from github.com/hflabs/city): a catalog row
// within 8 km whose name sounds the same takes the official spelling.
const TOWNS = (() => {
  try {
    return readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'data/ru-towns.tsv'), 'utf8')
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const [name, lat, lon, pop] = l.split('\t');
        return { name: String(name), lat: Number(lat), lon: Number(lon), pop: Number(pop) || 0, key: bgnKey(String(name)) };
      });
  } catch {
    return [];
  }
})();
const km = (la1, lo1, la2, lo2) => Math.hypot((la1 - la2) * 111, (lo1 - lo2) * 111 * Math.cos((la1 * Math.PI) / 180));

/** @param {Array<Array<string|number>>} rows RU rows only; returns the set of rows given an official name. */
function applyTowns(rows) {
  const done = new Set();
  for (const t of TOWNS) {
    let best = null;
    let bestScore = 0;
    for (const r of rows) {
      const d = km(t.lat, t.lon, Number(r[4]), Number(r[5]));
      if (d > 8) continue;
      const sim = Math.max(similarity(t.key, bgnKey(String(r[2] || ''))), similarity(t.key, bgnKey(String(r[1]))));
      if (sim < 0.75) continue;
      const score = sim * 10 - d / 4 + Math.log10(Number(r[6]) + 10);
      if (score > bestScore) {
        best = r;
        bestScore = score;
      }
    }
    if (!best || done.has(best)) continue;
    done.add(best);
    if (best[1] !== t.name && String(best[1]).replace(/ё/g, 'е') !== t.name) {
      const old = String(best[1]);
      best[1] = t.name;
      while (best.length < 9) best.push('');
      best[9] = [...new Set([...String(best[9] ?? '').split('|').filter(Boolean), old])].filter((a) => a !== t.name).join('|');
    }
  }
  return done;
}

/** @param {Array<Array<string|number>>} rows */
export function applyCityFixes(rows) {
  const ids = new Set();
  const ru = rows.filter((r) => r[3] === 'RU');
  const official = applyTowns(ru);
  for (const r of rows) {
    ids.add(r[0]);
    const fix = RENAME[/** @type {string} */ (r[0])];
    if (fix) {
      const [ru, ...aka] = fix;
      if (!r[2] && r[1] !== ru) r[2] = r[1];
      r[1] = ru;
      while (r.length < 9) r.push('');
      r[9] = [...new Set(aka)].join('|');
    } else if (r[3] === 'RU' && !official.has(r) && !KEEP.has(String(r[0])) && String(r[0]).startsWith('gn:') && r[2] && russianFix(String(r[1]), String(r[2]))) {
      const old = String(r[1]);
      r[1] = /** @type {string} */ (russianFix(old, String(r[2])));
      while (r.length < 9) r.push('');
      r[9] = [...new Set([...String(r[9] ?? '').split('|').filter(Boolean), old])].join('|');
    } else if (!CYRILLIC.has(String(r[3])) && /^Е[^ёеиюя]/.test(String(r[1])) && /^[EÉ]/.test(String(r[2] || ''))) {
      r[1] = `Э${String(r[1]).slice(1)}`;
    }
  }
  for (const e of EXTRA) if (!ids.has(e[0])) rows.push([...e]);
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(dirname(dirname(fileURLToPath(import.meta.url))), 'public/data/cities.tsv');
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
  applyCityFixes(rows);
  writeFileSync(file, rows.map((r) => r.join('\t').replace(/\t+$/, '')).join('\n'));
  console.log('cities.tsv fixed', rows.length);
}
