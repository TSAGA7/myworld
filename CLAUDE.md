# MY WORLD — памятка для Claude

Репозиторий: https://github.com/TSAGA7/myworld · Сайт: https://tsaga7.github.io/myworld/
Владелец — TSAGA. Общение по-русски, коротко и по делу.

## Как работать с владельцем
- Он не программист: технические решения принимай сам, приноси готовый проверенный результат, а не варианты архитектуры.
- Никаких «заглушек», TODO и кнопок, которые ничего не делают. Если что-то невозможно — честно сказать и предложить замену.
- Задачи приходят нумерованными списками, часто со скриншотами с iPhone и фото-референсами. Каждый пункт — сделать и отчитаться по номерам.
- В отчёте: что сделано, что проверено, честные ограничения. Без пересказа шагов.
- Данные пользователя (IndexedDB) нельзя терять: любые изменения схемы — через миграцию Dexie.

## Стек
React 18 + Vite 5 + TypeScript (strict, noUncheckedIndexedAccess), Dexie 4 (база `myworld`), Zod, MapLibre GL ~5.24 (карта + globe),
d3-geo (SVG-карты, запасная карта), tesseract.js 7 и pdfjs-dist (импорт брони на устройстве), qrcode-generator, @zxing (штрихкоды), шрифт Onest.

## Команды
```
npm run check   # tsc + eslint + vitest — должно быть зелёным перед коммитом
npm run build   # сборка в dist/ (+ копирование OCR-файлов в public/ocr)
node scripts/build_world.mjs <папка-с-исходниками>   # пересборка городов/регионов/аэропортов (см. шапку скрипта)
```
Деплой: пуш в `main` → GitHub Actions → GitHub Pages. Проверка: `gh run list --repo TSAGA7/myworld --limit 1`.
Коммиты от имени `Claude <noreply@anthropic.com>`.

## Устройство
```
src/domain    чистая логика: модель (Zod), статистика, поиск, даты, деньги, билеты (ticket.ts), колесо (wheel.ts), статусы
src/data      Dexie (db.ts, миграции), store.ts — все записи, backup, shareTrip
src/geo       справочники: страны (в бандле), каталог городов, аэропорты, регионы, OCR, штрихкоды, геокодинг
src/screens   planet (MapLibre), countries (+ HomeCountry «Моя страна»), trips (поездки; разделы поездки — trips/sections/*), feed (лента), profile, Settings
src/ui        kit, иконки, Splash (заставка), Qr, SoftBar
public/data   cities.tsv (~194 тыс. городов GeoNames), regions/<страна>.json, airports.json, labels.json, countries.geojson
```
- Настройки — в таблице `meta` (`src/app/world.tsx`, тип `Settings`). Новая настройка = поле + значение по умолчанию.
- Повторные отметки не дублируются: у visits/plans уникальный `key`.
- Service worker генерируется в `vite.config.ts`: кэш `mw-*`, файлы с хешем содержимого — при обновлении качаются только изменённые; OCR и regions кэшируются при первом использовании.
- Старый адрес (внутри fitapp `/world/`) — только переадресация.
- Обновления: новая версия ждёт кнопку «Обновить» (без skipWaiting при установке), окно в центре со списком «Добавилось» — `src/app/update.ts`, `src/ui/UpdateCard.tsx`. **Каждый релиз с заметными изменениями — новая запись сверху в `src/app/changelog.json` (`n` на 1 больше, 1–3 коротких пункта для пользователя).**

## Что уже есть (кратко)
Карта/3D-глобус со столицами и крупными городами; страны (методика 195), «Моя страна» (регионы/города/%); поездки — колесо карточек с инерцией
или список, маршрут, билеты (посадочный с QR, IATA-поля, чтение штрихкода), жильё, брони, расходы, дневник, путеводитель, подсказки, документы,
чек-лист, бюджет ₽/$/€, импорт брони, «Отметить по фото» (EXIF-геометки → страны/города/поездки в Web Worker: src/geo/photoWorker.ts, photoScan.ts, photoGeo.ts, photoClient.ts; индекс городов — public/data/photo-index.bin из scripts/photo-index.mjs (собирается сам, не коммитится); один file input не размонтируется — iOS отдаёт фото с задержкой; на время окна глобус выгружается (app/lean.ts); проверка и правка дат/городов — domain/photoReview.ts; веб не даёт доступа ко всей галерее — пользователь выбирает фото сам), экспорт в календарь/Google/2ГИС, совместные поездки; профиль — статус (тексты владельца по числу стран),
достижения, карточка для соцсетей; заставка с планетой и самолётами при запуске.

## Путеводитель
- `domain/guideBlocks.ts` превращает сохранённый HTML Wikivoyage в блоки (абзацы, места с номером/адресом/телефоном); экран и PDF рисуют одни и те же блоки.
- Свой путеводитель: запись в `guides` с `kind: 'own'` (id `${tripId}:own:${cityId}`), пункты в `items`, фото — вложения `ownerType: 'guide'` с ownerId = id пункта. Логика — `domain/ownGuide.ts`, экран — `trips/OwnGuide.tsx`; режим «Автоматически/Свой» запоминается на телефоне.
- PDF: `trips/guidePdf.ts` рисует страницы A4 на canvas в стиле приложения, `domain/pdf.ts` склеивает их в PDF без библиотек. `window.print()` в установленном PWA на iPhone не работает — не возвращать. Поделиться — отдельной кнопкой (iOS требует жест пользователя).

## Лента (вкладка «Лента»: дайджест, новости, выгодные билеты)
- Данные не в сборке, а в ветке `data` (`feed/news.json`, `digest.json`, `deals.json`), приложение читает их с raw.githubusercontent.com (`src/feed/client.ts`), копия — в localStorage.
- `.github/workflows/feed.yml` каждый час: `scripts/feed/collect.ts` (Telegram t.me/s + RSS, источники — `src/feed/sources.ts`) и `scripts/feed/prices.ts` (Travelpayouts, секреты `TRAVELPAYOUTS_TOKEN`, `TRAVELPAYOUTS_MARKER`). Ветка `data` — один коммит, перезаписывается.
- Дайджест пишет запланированная задача Claude по `scripts/feed/DIGEST.md` (на подписке, без API-ключа); ссылки подставляет `src/feed/digest.ts` из news.json — выдумать нельзя.
- Утром и вечером вторая задача по `scripts/feed/EDITORIAL.md`: переводит зарубежные новости (`lang: 'en'` в sources.ts → `translations.json`, без перевода новость скрыта) и собирает «Интересное» из авторских каналов (`STORY_LIST` → `stories.json` → `interesting.json`). Логика — `src/feed/editorial.ts`.
- Дубли: `dedupe` в `src/feed/text.ts` (редкие слова, заголовки, флаги стран; авиакомпании/аэропорты/перевозчики друг с другом не склеиваются), регрессия на реальных постах — в тестах.
- Все источники приложения показываются в «Настройки → Источники» (`src/screens/SourcesSheet.tsx`, берёт список из sources.ts).
- Вкладки ленты (Билеты · Интересное · Дайджест · Новости) — `src/screens/feed/*`, по файлу на раздел, свайп — в `Feed.tsx`.
- «Проверить цену»: `supabase/functions/price-check` + переменные репозитория `PRICE_CHECK_URL`, `PRICE_CHECK_KEY` (пусто → показывается время последнего часового скана).
- Логика — `src/feed/*.ts` (импорты с `.ts`, скрипты запускаются `node --experimental-strip-types`), тесты — `src/feed/feed.test.ts`.

## Проверка
Headless Chromium (Playwright, swiftshader) в песочнице рисует очень медленно — скриншот до 40 с, рывки анимации там нормальны.
Логику проверять юнит-тестами, скриншоты — только ключевых экранов (iPhone 390×844). Внешние сайты из песочницы недоступны — мокать.

## Увлечения (Rider / Surf)
- Настройки `riderType` ('ski' | 'snowboard' | null — лыжи и борд одновременно невозможны по типу), `surf`, `travelTracking` (в `Settings`). Профиль — `screens/profile/Hobbies.tsx` (выбор, шутки владельца в `domain/hobby.ts` → `RIDER_JOKE`, не использовать как советы).
- Отметки — таблица `hobby` (Dexie v3): `key` = `${what}:${kind}:${placeId}`, what = 'visit' | 'fav', kind = 'resort' | 'spot'. Выключение увлечения их не трогает. «Был здесь» при включённом учёте путешествий отмечает и страну (`store.markHobby`).
- Каталоги не в сборке: `.github/workflows/catalog.yml` раз в неделю собирает `catalog/resorts.json` (OpenSkiMap + Wikidata: русское имя, Telegram P3789, сайт) и `catalog/spots.json` (координаты только из OSM по `scripts/catalog/spots-seed.json`) в ветку `data`; отчёты — `catalog/*-report.json`. Приложение читает их через `geo/hobbyCatalog.ts`, копия — в таблице `catalog`.
- Ручные правки/камеры/выключение объектов — `scripts/catalog/resorts-extra.json`, `spots-extra.json` (только с источником). Id курорта стабилен: при смене берётся прежний, старые — в `alt`.
- Свайп между вкладками (лента, «Мой мир») — общий хук `ui/useSwipe.ts` + класс `.swipeable` (touch-action: pan-y); жест не перехватывается только у реально прокручиваемых вбок рядов, полей, карт и шторок.
- Поиск курортов: `aliases` (resorts-extra, с источником) и `towns` (ближайшие города из cities.tsv при сборке каталога) + `placeSoundsLike` — совпадение по звучанию для любого написания.
- «Мой мир»: вкладки `rider`/`surf` — `screens/countries/HobbyWorld.tsx`, страница места — `PlaceSheet.tsx` (маршрут `#/countries/@resort/<id>`, `@spot`). На карте — слой `hobby-dots`.
- «Учитывать путешествия» (`travelTracking`): при выключении `app/actions.ts` не даёт отметить страну/город посещёнными (тост «Включить»), кнопки «Был здесь», «Отметить по фото», «Отметить города посещёнными» скрыты; планы, история, глобус и увлечения работают.
- Лента по увлечениям: разделы `Горы`/`Сёрф` в `src/feed/sources.ts` (или `hobby` у автора в `STORY_LIST`) видны только при включённом Rider/Surf или настройке `sportNews`; скрытые источники — `hiddenSources`. Логика — `src/feed/visibility.ts`. В дайджест спортивные новости не попадают (`scripts/feed/digest.ts`).
- «Сейчас тут» и уведомления: отметки `hobby` с what = 'here' (поле `until`, 7 дней, потом окно «Вы ещё тут?» — `HereCheck`), 'notify', 'mute'; логика — `domain/hobby.ts` → `resortWatch`, экран — `screens/countries/ResortWatch.tsx`.
- Оперативные сообщения курортов: `collect.ts` читает официальные Telegram-каналы курортов из `catalog/resorts.json` (поле `telegram`, `tgSource`: official = проверен вручную в resorts-extra, wikidata), `classifyStatus` (`src/feed/resortStatus.ts`) берёт только явные посты о закрытии/открытии трасс и подъёмников, снегопаде → `feed/resort-status.json` (с временем последней успешной синхронизации каждого канала). Свежесть: критичные 24 ч, информационные 72 ч.
- Push: функция `supabase/functions/myworld-push` в Supabase-проекте **content-factory** (gpnpqwyniqmdinwazegh), таблицы `myworld_*` (миграция `supabase/migrations/20261101_myworld_push.sql`, VAPID-ключи — в `myworld_config`). Переезд: применить миграцию в новом проекте, задеплоить функцию, перенести строки `myworld_config`, поменять `PUSH_URL` в `src/app/push.ts` и адрес в `feed.yml`. Клиент — `src/app/push.ts`, обработчики push — в sw.js (`vite.config.ts`). На iPhone push работает только у установленного на экран «Домой» приложения.
- Камеры: `scripts/catalog/webcams.mjs` ищет страницу камер только на официальном сайте курорта (+ .m3u8 / снимки на ней) → `cams` с `auto: true`; ручные — в resorts-extra. Экран — `screens/countries/Cameras.tsx` (снимок не выдаётся за видео, недоступная камера → ссылка на сайт).
