import type { ReactNode } from 'react';
import { applyUpdate, dismissUpdate, useUpdate } from '../app/update';
import { Icon } from './Icon';

/** A centred card over a dimmed screen: updates and errors. */
export function CenterCard({
  title,
  text,
  items,
  primary,
  secondary,
}: {
  title: string;
  text?: ReactNode;
  items?: string[];
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}) {
  return (
    <div className="center-overlay" role="dialog" aria-modal="true" aria-labelledby="center-card-title">
      <div className="center-card card stack">
        <span className="center-badge" aria-hidden="true">
          <Icon name="sparkle" size={22} />
        </span>
        <h1 id="center-card-title" className="h2">
          {title}
        </h1>
        {text && (
          <p className="muted" style={{ margin: 0 }}>
            {text}
          </p>
        )}
        {items && items.length > 0 && (
          <ul className="news-list">
            {items.map((it) => (
              <li key={it}>{it}</li>
            ))}
          </ul>
        )}
        <div className="stack tight">
          <button type="button" className="btn lime block" onClick={primary.onClick}>
            {primary.label}
          </button>
          {secondary && (
            <button type="button" className="btn ghost block" onClick={secondary.onClick}>
              {secondary.label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** «Вышло обновление» / «Приложение обновилось» with the list of what was added. */
export function UpdatePrompt() {
  const u = useUpdate();
  if (u.kind === 'none') return null;
  if (u.kind === 'ready')
    return (
      <CenterCard
        title="Вышло обновление"
        text={u.items.length ? 'Добавилось:' : 'Исправления и улучшения. Данные останутся на месте.'}
        items={u.items}
        primary={{ label: 'Обновить', onClick: applyUpdate }}
        secondary={{ label: 'Позже', onClick: dismissUpdate }}
      />
    );
  return <CenterCard title="Приложение обновилось" text="Добавилось:" items={u.items} primary={{ label: 'Отлично', onClick: dismissUpdate }} />;
}
