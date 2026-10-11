import { Component, type ReactNode } from 'react';

/** Last line of defence: shows what broke and keeps the user's data untouched. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen">
        <div className="screen-inner">
          <div className="card stack">
            <h1 className="h2">Что-то пошло не так</h1>
            <p className="muted" style={{ margin: 0 }}>
              Экран не смог открыться. Ваши данные сохранены на устройстве. Ошибка: {this.state.error.message}
            </p>
            <button type="button" className="btn dark" onClick={() => (location.hash = '#/planet', location.reload())}>
              Открыть карту заново
            </button>
          </div>
        </div>
      </div>
    );
  }
}
