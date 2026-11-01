/** Building blocks shared by the trip sections: section header, form sheet, price fields, external link. */
import { type ReactNode, useState } from 'react';
import { useToast } from '../../../app/toast';
import { Icon } from '../../../ui/Icon';
import { Confirm, Segmented, Sheet } from '../../../ui/kit';
import { CURRENCIES, CURRENCY_SIGN, type Currency, isCurrency } from '../../../domain/money';
import { safeUrl } from '../common';

export function SectionHead({ title, onAdd, addLabel }: { title: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="section-title">
      <h3 className="h2">{title}</h3>
      <button type="button" className="btn sm lime" onClick={onAdd}>
        <Icon name="plus" size={16} /> {addLabel}
      </button>
    </div>
  );
}

export const text = (v: string) => v;

export function FormSheet({
  title,
  onClose,
  onSave,
  onDelete,
  canSave,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => Promise<void>;
  onDelete?: () => Promise<void>;
  canSave: boolean;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState(false);
  const toast = useToast();
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button type="button" className="btn danger" aria-label="Удалить запись" onClick={() => setDel(true)}>
              <Icon name="trash" size={18} />
            </button>
          )}
          <button
            type="button"
            className="btn dark"
            disabled={!canSave || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave();
                onClose();
              } catch (e) {
                toast(`Не удалось сохранить: ${e instanceof Error ? e.message : e}`);
              } finally {
                setBusy(false);
              }
            }}
          >
            Сохранить
          </button>
        </>
      }
    >
      {children}
      {del && onDelete && (
        <Confirm
          title="Удалить запись?"
          text="Запись и прикреплённые к ней файлы удалятся."
          confirmLabel="Удалить"
          danger
          onConfirm={async () => {
            await onDelete();
            onClose();
          }}
          onClose={() => setDel(false)}
        />
      )}
    </Sheet>
  );
}

export function PriceFields({ price, currency, setPrice, setCurrency }: { price: string; currency: string; setPrice: (v: string) => void; setCurrency: (v: string) => void }) {
  const legacy = currency && !isCurrency(currency.toUpperCase()) ? currency.toUpperCase() : null;
  return (
    <div className="stack tight">
      <div className="field">
        <span>Стоимость</span>
        <div className="price-input">
          <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" aria-label="Стоимость" />
          <Segmented
            label="Валюта"
            className="currency-switch"
            value={(isCurrency(currency.toUpperCase()) ? currency.toUpperCase() : '') as Currency}
            onChange={setCurrency}
            options={CURRENCIES.map((c) => ({ value: c, label: CURRENCY_SIGN[c] }))}
          />
        </div>
      </div>
      {legacy && <span className="faint tiny">Валюта {legacy} не входит в сумму поездки — выберите ₽, $ или €.</span>}
    </div>
  );
}

export function LinkOut({ url, label }: { url: string; label: string }) {
  const safe = safeUrl(url);
  if (!safe) return null;
  return (
    <a className="pill link-pill" href={safe} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      <Icon name="external" size={14} /> {label}
    </a>
  );
}

export const useToastFn = () => useToast();
