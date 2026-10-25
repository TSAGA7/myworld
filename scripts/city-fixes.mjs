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

/** @param {Array<Array<string|number>>} rows */
export function applyCityFixes(rows) {
  const ids = new Set();
  for (const r of rows) {
    ids.add(r[0]);
    const fix = RENAME[/** @type {string} */ (r[0])];
    if (fix) {
      const [ru, ...aka] = fix;
      if (!r[2] && r[1] !== ru) r[2] = r[1];
      r[1] = ru;
      while (r.length < 9) r.push('');
      r[9] = [...new Set(aka)].join('|');
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
