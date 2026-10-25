import { useEffect, useState } from 'react';
import { go } from '../../app/router';
import { useToast } from '../../app/toast';
import { db } from '../../app/world';
import { decodeBundle, importBundle, type MergeSummary, pendingTrip, previewMerge, setPendingTrip, type TripBundle } from '../../data/shareTrip';
import { countLabel, formatRange } from '../../domain/dates';
import { countryName } from '../../geo/reference';
import { Icon } from '../../ui/Icon';
import { Empty, Flag } from '../../ui/kit';

/** Opened from a shared link (#/join/<data>) or a trip file (#/join/file): shows the trip and adds or updates it on this device. */
export function JoinTrip({ code }: { code: string }) {
  const toast = useToast();
  const [bundle, setBundle] = useState<TripBundle | null>(null);
  const [plan, setPlan] = useState<MergeSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromFile = code === 'file';
    (fromFile ? Promise.resolve(pendingTrip()).then((b) => b ?? Promise.reject(new Error('Файл поездки не выбран. Откройте его ещё раз.'))) : decodeBundle(code))
      .then(async (b) => {
        setBundle(b);
        setPlan(await previewMerge(db, b));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [code]);

  if (error)
    return (
      <div className="screen">
        <div className="screen-inner">
          <Empty icon="suitcase" title="Не получилось открыть поездку" text={error} action={<button type="button" className="btn dark" onClick={() => go('trips', true)}>К поездкам</button>} />
        </div>
      </div>
    );
  if (!bundle || !plan)
    return (
      <div className="screen">
        <div className="empty">
          <span className="spinner" />
        </div>
      </div>
    );

  const t = bundle.trip;
  const cityNames = bundle.stops
    .sort((a, b) => a.order - b.order)
    .map((s) => bundle.cities.find((c) => c.id === s.cityId)?.name ?? '?');
  const run = async () => {
    setBusy(true);
    try {
      await importBundle(db, bundle);
      setPendingTrip(null);
      toast(plan.isNew ? 'Поездка добавлена' : 'Поездка обновлена');
      go(`trips/${t.id}`, true);
    } catch (e) {
      toast(`Не удалось: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="screen-inner">
        <h1 className="h1">
          <span className="thin">{code === 'file' ? 'Поездка' : bundle.from ? `${bundle.from} делится` : 'Вам прислали'}</span>
          <br />
          {code === 'file' ? 'из файла' : 'поездкой'}
        </h1>
        <div className="card stack">
          <h2 className="h2">{t.title}</h2>
          <div className="row wrap">
            <span className="date-pill num">{formatRange(t.startDate, t.endDate)}</span>
            {t.countryIds.map((c) => (
              <span key={c} className="pill">
                <Flag id={c} size="sm" /> {countryName(c)}
              </span>
            ))}
          </div>
          {cityNames.length > 0 && <p className="muted" style={{ margin: 0 }}>{cityNames.join(' → ')}</p>}
          <p className="faint small" style={{ margin: 0 }}>
            {countLabel(bundle.transport.length, 'билет', 'билета', 'билетов')}, {countLabel(bundle.stays.length, 'жильё', 'жилья', 'жилья')},{' '}
            {countLabel(bundle.expenses.length, 'расход', 'расхода', 'расходов')}, {countLabel(bundle.diary.length, 'запись', 'записи', 'записей')} дневника.{' '}
            {bundle.files.length > 0
              ? `Фото и документы: ${bundle.files.length}${bundle.trip.coverId ? ', с обложкой' : ''}.`
              : code === 'file'
                ? 'Фото и документов в файле нет.'
                : 'Файлы и фото по ссылке не передаются.'}
          </p>
        </div>
        <div className="banner">
          <Icon name="info" size={18} />
          <span>
            {plan.isNew
              ? 'Поездка появится у вас целиком. Отметки на вашей карте не изменятся.'
              : `Эта поездка уже есть. Новых записей: ${plan.added}, обновится: ${plan.updated}. Ваши более свежие правки сохранятся.`}
          </span>
        </div>
        <button type="button" className="btn lime block" disabled={busy} onClick={() => void run()}>
          {plan.isNew ? 'Добавить поездку' : 'Обновить поездку'}
        </button>
        <button
          type="button"
          className="btn ghost block"
          onClick={() => {
            setPendingTrip(null);
            go('trips', true);
          }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
