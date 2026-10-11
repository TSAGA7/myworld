import { useEffect, useState } from 'react';
import { setSplashOff } from '../ui/Splash';
import { getThemeChoice, setThemeChoice, type ThemeChoice } from '../app/theme';
import { useToast } from '../app/toast';
import { been, db, setSetting, useWorld } from '../app/world';
import { CURRENCIES, CURRENCY_NAME, CURRENCY_SIGN } from '../domain/money';
import { formatDate } from '../domain/dates';
import { Field } from '../ui/kit';
import { type Backup, exportBackup, parseBackup, restoreBackup, summarize } from '../data/backup';
import { countLabel } from '../domain/dates';
import { METHODOLOGIES, type Methodology } from '../domain/model';
import { METHODOLOGY_INFO, worldProgress } from '../domain/world';
import { COUNTRIES } from '../geo/reference';
import { Icon } from '../ui/Icon';
import { Confirm, Segmented, Sheet } from '../ui/kit';

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} МБ`;

export function Settings({ onClose }: { onClose: () => void }) {
  const { settings, world } = useWorld();
  const toast = useToast();
  const [theme, setTheme] = useState<ThemeChoice>(getThemeChoice);
  const [usage, setUsage] = useState<string | null>(null);
  const [withFiles, setWithFiles] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Backup | null>(null);

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then((e) => e.usage !== undefined && setUsage(`${mb(e.usage)}${e.quota ? ` из ${mb(e.quota)}` : ''}`))
      .catch(() => undefined);
  }, []);

  const doExport = async () => {
    setBusy(true);
    try {
      const now = new Date();
      const backup = await exportBackup(db, withFiles, now.toISOString());
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `myworld-${now.toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast(`Копия сохранена: ${mb(blob.size)}`);
    } catch (e) {
      toast(`Не удалось сохранить копию: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const pickImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      setPending(parseBackup(JSON.parse(await file.text())));
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Файл повреждён: это не JSON' : e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Sheet title="Настройки" onClose={onClose}>
      <section className="stack">
        <h3 className="h3">Оформление</h3>
        <Segmented
          label="Тема"
          value={theme}
          onChange={(v) => {
            setTheme(v);
            setThemeChoice(v);
          }}
          options={[
            { value: 'system', label: 'Как в системе' },
            { value: 'light', label: 'Светлая' },
            { value: 'dark', label: 'Тёмная' },
          ]}
        />
      </section>

      <section className="stack">
        <h3 className="h3">Поездки</h3>
        <Segmented
          label="Вид списка поездок"
          value={settings.tripsView}
          onChange={(v) => void setSetting('tripsView', v)}
          options={[
            { value: 'carousel', label: 'Карусель', icon: 'grid' },
            { value: 'list', label: 'Список', icon: 'list' },
          ]}
        />
      </section>

      <section className="stack">
        <h3 className="h3">Обращение</h3>
        <Segmented
          label="Пол"
          value={settings.gender}
          onChange={(v) => void setSetting('gender', v)}
          options={[
            { value: 'male', label: 'Мужской' },
            { value: 'female', label: 'Женский' },
          ]}
        />
        <span className="faint small">Кнопки будут писать «{been(settings.gender).here}».</span>
      </section>

      <section className="stack">
        <h3 className="h3">Валюта</h3>
        <Segmented
          label="Валюта по умолчанию"
          value={settings.currency}
          onChange={(v) => void setSetting('currency', v)}
          options={CURRENCIES.map((c) => ({ value: c, label: `${CURRENCY_SIGN[c]} ${CURRENCY_NAME[c]}` }))}
        />
        <span className="faint small">В ней вводятся новые цены и считается сумма поездок. В каждой записи валюту можно поменять.</span>
        <RatesEditor />
      </section>

      <section className="stack">
        <h3 className="h3">Как считать страны</h3>
        <div className="list">
          {METHODOLOGIES.map((m: Methodology) => {
            const p = worldProgress(COUNTRIES, world.visitedCountryIds, m);
            return (
              <button key={m} type="button" className="list-row" onClick={() => void setSetting('methodology', m)} aria-pressed={settings.methodology === m}>
                <span className={`radio ${settings.methodology === m ? 'on' : ''}`} aria-hidden="true" />
                <span className="grow">
                  <span className="t">{METHODOLOGY_INFO[m].title}</span>
                  <span className="s block">{METHODOLOGY_INFO[m].hint}</span>
                </span>
                <span className="faint small num">
                  {p.visited}/{p.total}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="stack">
        <h3 className="h3">Карта</h3>
        <div className="list">
          <label className="list-row tap">
            <span className="grow">
              <span className="t">Упрощённый режим</span>
              <span className="s block">Лёгкая карта без WebGL, глобус не вращается сам. Для старых телефонов.</span>
            </span>
            <input type="checkbox" className="switch" checked={settings.lite} onChange={(e) => void setSetting('lite', e.target.checked)} />
          </label>
          <label className="list-row tap">
            <span className="grow">
              <span className="t">Заставка при запуске</span>
              <span className="s block">Планета и самолёты по своим маршрутам — пара секунд при открытии. Тап пропускает.</span>
            </span>
            <input type="checkbox" className="switch" checked={settings.splash} onChange={(e) => {
                setSplashOff(!e.target.checked);
                void setSetting('splash', e.target.checked);
              }} />
          </label>
          <label className="list-row tap">
            <span className="grow">
              <span className="t">Подробная подложка</span>
              <span className="s block">Названия городов, дороги и озёра из OpenStreetMap. Нужен интернет; без него карта работает на встроенных границах.</span>
            </span>
            <input type="checkbox" className="switch" checked={settings.detail} onChange={(e) => void setSetting('detail', e.target.checked)} />
          </label>
        </div>
      </section>

      <section className="stack">
        <h3 className="h3">Данные</h3>
        <p className="muted small" style={{ margin: 0 }}>
          Всё хранится только на этом устройстве{usage ? ` (занято ${usage})` : ''}. Сохраняйте резервную копию, чтобы перенести данные на другой телефон или
          не потерять их при очистке Safari.
        </p>
        <label className="row small">
          <input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} />
          Включить файлы билетов и броней в копию
        </label>
        <div className="grid-2">
          <button type="button" className="btn dark" onClick={() => void doExport()} disabled={busy}>
            <Icon name="download" size={18} /> Сохранить копию
          </button>
          <label className="btn glass-btn">
            <Icon name="upload" size={18} /> Восстановить
            <input type="file" accept="application/json,.json" className="sr" onChange={(e) => void pickImport(e.target.files?.[0])} />
          </label>
        </div>
      </section>

      <section className="stack tight">
        <h3 className="h3">Источники</h3>
        <p className="faint small" style={{ margin: 0 }}>
          Границы стран и регионов, столицы — Natural Earth (общественное достояние). Справочник городов — GeoNames (CC BY 4.0). Аэропорты — OurAirports (общественное достояние). Подробная подложка — OpenFreeMap, OpenMapTiles, © участники
          OpenStreetMap. Флаги — flag-icons (MIT). Шрифт Onest (SIL OFL). Число стран зависит от выбранного способа подсчёта.
        </p>
      </section>

      {pending && (
        <Confirm
          title="Восстановить из копии?"
          text={(() => {
            const s = summarize(pending);
            return `В копии ${countLabel(s.trips, 'поездка', 'поездки', 'поездок')}, ${countLabel(s.visits, 'посещение', 'посещения', 'посещений')}, ${countLabel(s.files, 'файл', 'файла', 'файлов')}${
              s.missingFiles ? ` (${s.missingFiles} без содержимого — они не восстановятся)` : ''
            }. Текущие данные на этом устройстве будут заменены.`;
          })()}
          confirmLabel="Заменить данные"
          danger
          onConfirm={async () => {
            await restoreBackup(db, pending);
            toast('Данные восстановлены');
          }}
          onClose={() => setPending(null)}
        />
      )}
    </Sheet>
  );
}

/** Exchange rates: edited by hand or refreshed from the Bank of Russia (works only online). */
function RatesEditor() {
  const { settings } = useWorld();
  const toast = useToast();
  const [usd, setUsd] = useState(String(settings.rates.USD));
  const [eur, setEur] = useState(String(settings.rates.EUR));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setUsd(String(settings.rates.USD));
    setEur(String(settings.rates.EUR));
  }, [settings.rates.USD, settings.rates.EUR]);
  const num = (v: string) => Number(v.replace(',', '.'));
  const valid = num(usd) > 0 && num(eur) > 0;
  const changed = valid && (num(usd) !== settings.rates.USD || num(eur) !== settings.rates.EUR);
  const save = async () => {
    await setSetting('rates', { USD: num(usd), EUR: num(eur) });
    await setSetting('ratesSource', 'manual');
    await setSetting('ratesDate', new Date().toISOString().slice(0, 10));
    toast('Курсы сохранены');
  };
  const refresh = async () => {
    setBusy(true);
    try {
      const r = await fetch('https://www.cbr-xml-daily.ru/daily_json.js', { cache: 'no-store' });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { Date: string; Valute: { USD: { Value: number }; EUR: { Value: number } } };
      const rates = { USD: Math.round(j.Valute.USD.Value * 10000) / 10000, EUR: Math.round(j.Valute.EUR.Value * 10000) / 10000 };
      if (!(rates.USD > 0 && rates.EUR > 0)) throw new Error('пустой ответ');
      await setSetting('rates', rates);
      await setSetting('ratesSource', 'cbr');
      await setSetting('ratesDate', j.Date.slice(0, 10));
      toast(`Курс ЦБ: $ ${rates.USD.toFixed(2)} ₽, € ${rates.EUR.toFixed(2)} ₽`);
    } catch {
      toast(navigator.onLine ? 'Не удалось получить курс ЦБ — введите вручную' : 'Нет интернета — курс можно ввести вручную');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card flat stack">
      <div className="rates-grid">
        <Field label="1 $ в рублях">
          <input className="input" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} />
        </Field>
        <Field label="1 € в рублях">
          <input className="input" inputMode="decimal" value={eur} onChange={(e) => setEur(e.target.value)} />
        </Field>
      </div>
      <span className="faint tiny">
        {settings.ratesSource === 'manual' ? 'Введены вручную' : 'Курс ЦБ РФ'}
        {settings.ratesDate ? ` на ${formatDate(settings.ratesDate)}` : ''}
      </span>
      <div className="grid-2">
        <button type="button" className="btn glass-btn sm" disabled={busy} onClick={() => void refresh()}>
          <Icon name="rotate" size={16} /> {busy ? 'Загружаю…' : 'Обновить'}
        </button>
        <button type="button" className="btn dark sm" disabled={!changed} onClick={() => void save()}>
          Сохранить
        </button>
      </div>
    </div>
  );
}
