# Ежедневный ИИ-дайджест MY WORLD

Инструкция для запланированной задачи Claude (раз в день, вечером по Москве). Ключи не нужны: задача работает на подписке.
Результат — `feed/digest.json` в ветке `data`, приложение показывает его во вкладке «Лента → Дайджест».

## Шаги

```bash
cd ~ && rm -rf myworld feed-data
git clone --depth 1 https://github.com/TSAGA7/myworld myworld
git clone --depth 1 --branch data https://github.com/TSAGA7/myworld feed-data
cd myworld && npm ci --omit=dev --ignore-scripts
export FEED_DIR=~/feed-data/feed
node --experimental-strip-types scripts/feed/digest.ts input > ~/news.txt
```

1. Прочитай `~/news.txt` целиком: это новости тревел-каналов и сайтов за последние 24 часа, у каждой есть `[id]`.
2. Напиши черновик `~/draft.json`:

```json
{
  "lead": "одна строка: 3–4 главные темы дня через запятую",
  "main": [{ "title": "…", "text": "…", "newsIds": ["atorus:12345"] }],
  "other": [{ "title": "…", "text": "…", "newsIds": ["…"] }]
}
```

3. Проверь и опубликуй:

```bash
node --experimental-strip-types scripts/feed/digest.ts publish ~/draft.json
cd ~/feed-data && git add feed/digest.json
git -c user.name=Claude -c user.email=noreply@anthropic.com commit -m "Дайджест $(date +%F)"
git push origin HEAD:data || (git pull --rebase origin data && git push origin HEAD:data)
```

Если `publish` ругается — исправь черновик и запусти снова, ссылки и id не выдумывай.

## Правила редакции

- Пиши по-русски, своими словами: 1–3 коротких предложения на пункт. Не копируй фразы постов.
- **Главное** (3–5 пунктов): то, что меняет планы путешественника из России — визы и въезд, новые и отменённые рейсы,
  правила, сборы, сбои в аэропортах, крупные распродажи.
- **Остальное** (до 10 пунктов): прочее полезное. Одна история = один пункт, даже если её пересказали пять каналов.
- Не включай рекламу, конкурсы, розыгрыши, посты «доброе утро», мнения без фактов.
- Только факты из `news.txt`: никаких цифр, дат и названий, которых там нет.
- `newsIds` — точные id из квадратных скобок, ссылки приложение подставит само.
- Если за сутки меньше 3 новостей — дайджест не публикуй, просто заверши задачу.
