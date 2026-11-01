import { useState } from 'react';
import { createPortal } from 'react-dom';
import { setSetting, useWorld } from '../../app/world';
import { RIDER_FULL, RIDER_JOKE, type RiderType } from '../../domain/hobby';
import { CenterCard } from '../../ui/UpdateCard';
import { RiderArt, SkiArt, SurfArt } from '../../ui/HobbyArt';
import { Icon } from '../../ui/Icon';
import { Confirm } from '../../ui/kit';

/** «Мои увлечения» in the profile: Rider (skis or snowboard) and Surf. Switching off keeps the visited places. */
export function Hobbies() {
  const { settings } = useWorld();
  const [rider, setRider] = useState(false);
  const [surfOff, setSurfOff] = useState(false);
  const [joke, setJoke] = useState<{ title: string; text: string; art: 'ski' | 'snowboard' | 'surf'; then: () => void } | null>(null);

  const addSurf = () =>
    setJoke({
      title: 'Волна поймана!',
      art: 'surf',
      text: 'Теперь вы сёрфер. В «Моём мире» появился раздел «Сёрфинг» — отмечайте споты, где катались.',
      then: () => void setSetting('surf', true),
    });

  return (
    <section className="stack tight">
      <h2 className="h2">Мои увлечения</h2>
      <div className="hobby-grid">
        <button type="button" className={`hobby-tile ${settings.riderType ? 'on' : ''}`} onClick={() => setRider(true)}>
          <span className="hobby-tile-art">{settings.riderType ? <RiderArt type={settings.riderType} size={58} /> : <SkiArt size={58} />}</span>
          <b>Rider</b>
          <span className="s">{settings.riderType ? RIDER_FULL[settings.riderType] : 'Лыжи или сноуборд'}</span>
          {!settings.riderType && <span className="hobby-add">+ Добавить</span>}
        </button>
        <button type="button" className={`hobby-tile ${settings.surf ? 'on' : ''}`} onClick={() => (settings.surf ? setSurfOff(true) : addSurf())}>
          <span className="hobby-tile-art">
            <SurfArt size={58} />
          </span>
          <b>Surf</b>
          <span className="s">{settings.surf ? 'Сёрфер' : 'Сёрф-споты мира'}</span>
          {!settings.surf && <span className="hobby-add">+ Добавить</span>}
        </button>
      </div>

      {rider && (
        <RiderPicker
          current={settings.riderType}
          onClose={() => setRider(false)}
          onPick={(t) => {
            setRider(false);
            if (t === settings.riderType) return;
            setJoke({ ...RIDER_JOKE[t], art: t, then: () => void setSetting('riderType', t) });
          }}
          onOff={() => {
            setRider(false);
            void setSetting('riderType', null);
          }}
        />
      )}
      {surfOff && (
        <Confirm
          title="Отключить Surf?"
          text="Раздел «Сёрфинг» исчезнет из «Моего мира». Отмеченные споты сохранятся — вернутся, если включить Surf снова."
          confirmLabel="Отключить"
          onConfirm={() => setSetting('surf', false)}
          onClose={() => setSurfOff(false)}
        />
      )}
      {joke &&
        createPortal(
          <CenterCard
            title={joke.title}
            text={joke.text}
            badge={joke.art === 'surf' ? <SurfArt size={34} /> : <RiderArt type={joke.art} size={34} />}
            primary={{
              label: 'ОК',
              onClick: () => {
                joke.then();
                setJoke(null);
              },
            }}
          />,
          document.body,
        )}
    </section>
  );
}

/** Full-screen choice between skis and snowboard: exactly one of them. */
function RiderPicker({ current, onPick, onOff, onClose }: { current: RiderType | null; onPick: (t: RiderType) => void; onOff: () => void; onClose: () => void }) {
  return createPortal(
    <div className="center-overlay rider-overlay" role="dialog" aria-modal="true" aria-labelledby="rider-title">
      <div className="rider-pick card">
        <header className="row between">
          <div>
            <h1 id="rider-title" className="h2">
              Rider
            </h1>
            <p className="muted small" style={{ margin: '2px 0 0' }}>
              Выберите одно — лыжи или сноуборд
            </p>
          </div>
          <button type="button" className="circle-btn sm" onClick={onClose} aria-label="Закрыть">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="rider-options" role="radiogroup" aria-label="Rider">
          {(['ski', 'snowboard'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={current === t} className={`rider-option ${current === t ? 'on' : ''}`} onClick={() => onPick(t)}>
              <RiderArt type={t} size={128} />
              <b>{RIDER_FULL[t]}</b>
              {current === t && <span className="s">Выбрано</span>}
            </button>
          ))}
        </div>
        {current && (
          <button type="button" className="btn ghost block" onClick={onOff}>
            Отключить Rider
            <span className="faint small"> · курорты останутся в истории</span>
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
