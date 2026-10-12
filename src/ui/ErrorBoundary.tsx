import { Component, type ReactNode, useEffect, useState } from 'react';
import { applyUpdate, remoteNews } from '../app/update';
import { isUpdateError } from '../domain/changes';
import { CenterCard } from './UpdateCard';

/** Last line of defence: shows what broke and keeps the user's data untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // The app was updated while this screen was open: offer the update instead of an error.
    if (isUpdateError(error)) return <UpdatedMeanwhile />;
    return (
      <CenterCard
        title="Что-то пошло не так"
        text={`Экран не смог открыться. Ваши данные сохранены на устройстве. Ошибка: ${error.message}`}
        primary={{ label: 'Открыть карту заново', onClick: () => ((location.hash = '#/planet'), location.reload()) }}
      />
    );
  }
}

function UpdatedMeanwhile() {
  const [items, setItems] = useState<string[] | null>(null);
  useEffect(() => {
    void remoteNews().then(setItems);
  }, []);
  return (
    <CenterCard
      title="Вышло обновление"
      text={items === null || items.length ? 'Добавилось:' : 'Исправления и улучшения. Данные останутся на месте.'}
      items={items ?? []}
      primary={{ label: 'Обновить', onClick: applyUpdate }}
    />
  );
}
