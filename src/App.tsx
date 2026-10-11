import { lazy, Suspense, useState } from 'react';
import { useRoute } from './app/router';
import { useWorld } from './app/world';
import { Planet } from './screens/planet/Planet';
import { Settings } from './screens/Settings';
import { SoftBar, type Tab } from './ui/SoftBar';

const Countries = lazy(() => import('./screens/countries/Countries').then((m) => ({ default: m.Countries })));
const Trips = lazy(() => import('./screens/trips/Trips').then((m) => ({ default: m.Trips })));

const Loading = () => (
  <div className="screen">
    <div className="empty">
      <span className="spinner" />
    </div>
  </div>
);

export function App() {
  const route = useRoute();
  const { error, ready } = useWorld();
  const [settings, setSettings] = useState(false);
  const tab: Tab = route[0] === 'countries' || route[0] === 'trips' ? route[0] : 'planet';

  if (error) {
    return (
      <div className="screen">
        <div className="screen-inner">
          <div className="card stack">
            <h1 className="h2">Хранилище недоступно</h1>
            <p className="muted" style={{ margin: 0 }}>
              Браузер не дал открыть базу данных ({error}). Так бывает в приватном режиме или когда место на устройстве закончилось.
              Откройте приложение в обычной вкладке Safari или освободите место и обновите страницу.
            </p>
            <button type="button" className="btn dark" onClick={() => location.reload()}>
              Обновить страницу
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      {/* The planet stays mounted: its WebGL scene and geodata are created once per session. */}
      <div className="tab-layer" hidden={tab !== 'planet'} aria-hidden={tab !== 'planet'}>
        <Planet active={tab === 'planet'} onSettings={() => setSettings(true)} />
      </div>
      {tab !== 'planet' && (
        <div className="tab-layer">
          <Suspense fallback={<Loading />}>
            {!ready ? <Loading /> : tab === 'countries' ? <Countries route={route} onSettings={() => setSettings(true)} /> : <Trips route={route} />}
          </Suspense>
        </div>
      )}
      <SoftBar current={tab} />
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}
