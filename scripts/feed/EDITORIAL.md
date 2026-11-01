# Утренний и вечерний выпуск MY WORLD: переводы и «Интересное»

Инструкция для запланированной задачи Claude (утром и вечером по Москве, на подписке, без ключей).
Результат — `feed/translations.json` и `feed/interesting.json` в ветке `data`.

## Подготовка

```bash
cd ~ && rm -rf myworld feed-data
git clone --depth 1 https://github.com/TSAGA7/myworld myworld
git clone --depth 1 --branch data https://github.com/TSAGA7/myworld feed-data
cd myworld && npm ci --omit=dev --ignore-scripts
export FEED_DIR=~/feed-data/feed
```

## 1. Перевод зарубежных новостей

```bash
node --experimental-strip-types scripts/feed/translate.ts input > ~/to-translate.json
```

Переведи каждую запись на русский и сохрани `~/translated.json` — массив `[{ "id", "title", "text" }]` с теми же `id`.
- Заголовок — естественный русский заголовок новости, не дословный кальк. Текст — 1–2 предложения, до 300 знаков.
- Названия авиакомпаний, отелей, программ лояльности оставляй как принято в русских СМИ (Lufthansa, Hyatt, Marriott Bonvoy).
- Рекламу, кредитные карты США, зарплаты, военную авиацию и подборки «10 лучших …» не переводи: запиши `{ "id": "…", "skip": true }` — новость останется скрытой и больше не попадёт в список. Переводи то, что полезно путешественнику из России: рейсы, аэропорты, правила, отели, направления, сбои.

```bash
node --experimental-strip-types scripts/feed/translate.ts publish ~/translated.json
```

Если пустой список на входе — шаг пропусти.

## 2. «Интересное»

```bash
node --experimental-strip-types scripts/feed/interesting.ts input > ~/stories.txt
```

Выбери 3–6 самых полезных и интересных для путешественника постов (личный опыт, маршрут, лайфхак, место, сезон, визы глазами автора)
и напиши `~/stories.json`:

```json
{ "items": [{ "country": "JP", "place": "Япония", "text": "в пригороде Токио советуют музей под открытым небом …", "storyIds": ["wrenjapan:1234"] }] }
```

- `country` — код страны ISO-2 заглавными (`""`, если это не одна страна), `place` — страна, остров или регион.
- `text` — одно предложение в духе «автор делится опытом / советует / рассказывает», своими словами, с конкретикой из поста.
- Не бери рекламу, анонсы видео без содержания, розыгрыши, посты «с ноябрём нас». Новостные пересказы — тоже нет, это раздел «Новости».
- Если подходящих постов меньше двух — шаг пропусти.

```bash
node --experimental-strip-types scripts/feed/interesting.ts publish ~/stories.json
```

## 3. Публикация

```bash
cd ~/feed-data && git add feed && git -c user.name=Claude -c user.email=noreply@anthropic.com commit -m "Выпуск $(date +%F_%H)"
git push origin HEAD:data || (git pull --rebase origin data && git push origin HEAD:data)
```

Если `publish` ругается — исправь файл и запусти снова. id и ссылки не выдумывай: ссылки на авторов подставляет код.
