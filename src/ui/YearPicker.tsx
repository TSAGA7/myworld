import { useState } from 'react';
import { MIN_YEAR, normalizeYears } from '../domain/years';
import { Sheet } from './kit';

/**
 * «Когда вы были?» — years of a country visit. Several years can be picked; years that come from trips and dates are
 * shown switched on and locked (they change with the trip or the date). `mode = add` also offers «Не помню».
 */
export function YearPicker({
  title,
  mode,
  initial,
  locked = [],
  onDone,
  onClose,
}: {
  title: string;
  mode: 'add' | 'edit';
  initial: readonly number[];
  locked?: readonly number[];
  onDone: (years: number[]) => void | Promise<void>;
  onClose: () => void;
}) {
  const now = new Date().getFullYear();
  const [picked, setPicked] = useState<number[]>(() => normalizeYears([...initial], now));
  const [other, setOther] = useState('');
  const recent = Array.from({ length: 12 }, (_, i) => now - i);
  const older = normalizeYears([...picked, ...locked], now).filter((y) => y < now - 11);
  const lockedSet = new Set(locked);
  const toggle = (y: number) => setPicked((p) => (p.includes(y) ? p.filter((x) => x !== y) : normalizeYears([...p, y], now)));
  const otherYear = Number(other);
  const otherOk = other.length === 4 && Number.isInteger(otherYear) && otherYear >= MIN_YEAR && otherYear <= now;

  const chip = (y: number) => {
    const isLocked = lockedSet.has(y);
    const on = isLocked || picked.includes(y);
    return (
      <button key={y} type="button" className="chip year-chip" aria-pressed={on} disabled={isLocked} onClick={() => toggle(y)}>
        {y}
      </button>
    );
  };

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <div className="year-actions">
          {mode === 'add' && (
            <button type="button" className="btn ghost" onClick={() => void onDone([])}>
              Не помню
            </button>
          )}
          <button type="button" className="btn lime" disabled={mode === 'add' && picked.length === 0} onClick={() => void onDone(picked)}>
            {mode === 'add' ? 'Отметить' : 'Сохранить'}
          </button>
        </div>
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        В каком году вы были? Можно выбрать несколько — если ездили не раз.
      </p>
      <div className="year-grid">{recent.map(chip)}</div>
      {older.length > 0 && <div className="year-grid">{older.map(chip)}</div>}
      <div className="row">
        <input
          className="input grow"
          inputMode="numeric"
          placeholder="Другой год"
          value={other}
          maxLength={4}
          onChange={(e) => setOther(e.target.value.replace(/\D/g, ''))}
          aria-label="Другой год"
        />
        <button
          type="button"
          className="btn glass-btn"
          disabled={!otherOk}
          onClick={() => {
            setPicked((p) => normalizeYears([...p, otherYear], now));
            setOther('');
          }}
        >
          Добавить
        </button>
      </div>
      {locked.length > 0 && (
        <small className="faint">
          {locked.join(', ')} — из поездок и дат посещения городов, меняются там.
        </small>
      )}
    </Sheet>
  );
}
