import { useState } from 'react';
import { go } from '../../app/router';
import { useToast } from '../../app/toast';
import { been, setSetting, store, useWorld } from '../../app/world';
import { countLabel, plural } from '../../domain/dates';
import { INHABITED_CONTINENTS } from '../../domain/achievements';
import { catalogToCity } from '../../geo/catalog';
import { countryName } from '../../geo/reference';
import { prepareFile, useAttachmentUrl } from '../../ui/files';
import { Icon } from '../../ui/Icon';
import { Field, Segmented, Sheet, Topo } from '../../ui/kit';
import { PlaceSearch } from '../../ui/PlaceSearch';
import { ShareCardSheet } from './ShareCard';
import { useFacts } from './useFacts';
import { travelerStatus } from '../../domain/status';
import { Hobbies } from './Hobbies';
import { AchSection, fromHobby, fromTravel } from './AchievementInfo';
import { ModeSwitch, profileModes, type ProfileMode } from './ModeSwitch';
import { useHobbyStats } from './useHobbyStats';

export function Profile({ onSettings }: { onSettings: () => void }) {
  const { settings, world, trips } = useWorld();
  const { progress, facts, achievements, home, perYear, top, travelRows } = useFacts();
  const toast = useToast();
  const avatar = useAttachmentUrl(settings.avatarId);
  const [edit, setEdit] = useState(false);
  const [share, setShare] = useState(false);
  const initials = (settings.name || 'Путешественник').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  const pickAvatar = async (f: File | undefined) => {
    if (!f) return;
    try {
      const att = await store.addAttachment('', 'avatar', 'me', await prepareFile(f));
      if (settings.avatarId) await store.deleteAttachment(settings.avatarId);
      await setSetting('avatarId', att.id);
    } catch (e) {
      toast(`Не удалось сохранить фото: ${e instanceof Error ? e.message : e}`);
    }
  };

  // «Путешествия | Борд | Сёрфинг» for the facts and the achievements; only hobbies that are on.
  const hobbyModes = profileModes(settings.riderType, settings.surf);
  const [factPick, setFactMode] = useState<ProfileMode>('travel');
  const [achPick, setAchMode] = useState<ProfileMode>('travel');
  const factMode = hobbyModes.some((m) => m.value === factPick) ? factPick : 'travel';
  const achMode = hobbyModes.some((m) => m.value === achPick) ? achPick : 'travel';
  const hobbyStats = useHobbyStats();
  const shownRows = factMode === 'rider' ? hobbyStats.riderRows : factMode === 'surf' ? hobbyStats.surfRows : travelRows;

  // 4th tile: every trip in «Поездки», upcoming ones too («2 поездки», as on the trips screen); without trips —
  // the years with travels instead of «0».
  const tail = trips.length > 0
    ? { n: trips.length, label: plural(trips.length, 'поездка', 'поездки', 'поездок') }
    : perYear.length > 0
      ? { n: perYear.length, label: `${plural(perYear.length, 'год', 'года', 'лет')} в пути` }
      : null;

  return (
    <div className="screen profile-screen">
      <Topo />
      <div className="screen-inner">
        <header className="row between">
          <h1 className="h1">
            <span className="thin">Мой </span>профиль
          </h1>
          <button type="button" className="circle-btn" onClick={onSettings} aria-label="Настройки">
            <Icon name="settings" size={20} />
          </button>
        </header>

        <section className="card profile-head">
          <label className="avatar" aria-label="Сменить фото">
            {avatar ? <img src={avatar} alt="" /> : <span>{initials}</span>}
            <input type="file" accept="image/*" className="sr" onChange={(e) => void pickAvatar(e.target.files?.[0])} />
          </label>
          <div className="grow">
            <div className="h2 ellipsis">{settings.name || 'Путешественник'}</div>
            <div className="muted small ellipsis">{home ? `Дом: ${home.name}, ${countryName(home.countryId)}` : 'Домашний город не указан'}</div>
          </div>
          <button type="button" className="circle-btn sm" onClick={() => setEdit(true)} aria-label="Изменить профиль">
            <Icon name="edit" size={16} />
          </button>
        </section>

        <section className="profile-stats" style={{ gridTemplateColumns: `repeat(${3 + Number(!!tail)}, minmax(0, 1fr))` }}>
          <div className="pstat big">
            <b className="num">{progress.visited}</b>
            <span>{plural(progress.visited, 'страна', 'страны', 'стран')}</span>
          </div>
          <div className="pstat">
            <b className="num">{facts.cities}</b>
            <span>{plural(facts.cities, 'город', 'города', 'городов')}</span>
          </div>
          <div className="pstat">
            <b className="num">{progress.percent}%</b>
            <span>мира</span>
          </div>
          <div className="pstat">
            <b className="num">{facts.continents.filter((c) => (INHABITED_CONTINENTS as readonly string[]).includes(c)).length}/6</b>
            <span>континентов</span>
          </div>
          {tail && (
            <div className="pstat">
              <b className="num">{tail.n}</b>
              <span>{tail.label}</span>
            </div>
          )}
        </section>

        <StatusCard countries={progress.visited} />

        <Hobbies />

        <button type="button" className="btn lime block" onClick={() => setShare(true)}>
          <Icon name="share" size={19} /> Поделиться картой путешествий
        </button>

        {(travelRows.length > 0 || hobbyModes.length > 1) && (
          <section className="stack tight">
            <div className="section-title wrap">
              <h2 className="h2">Факты</h2>
              <ModeSwitch label="Факты о чём" value={factMode} onChange={setFactMode} modes={hobbyModes} />
            </div>
            {shownRows.length > 0 ? (
              <div className="list">
                {shownRows.map((f) => (
                  <div key={f.id} className="list-row fact">
                    <span className="fact-ic" aria-hidden="true">
                      {f.icon}
                    </span>
                    <span className="grow">{f.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="faint small" style={{ margin: 0 }}>
                {factMode === 'travel' ? 'Отметьте страны и города — здесь появятся факты о путешествиях.' : `Отметьте «${been(settings.gender).here}» на ${factMode === 'surf' ? 'спотах' : 'курортах'} в «Мой мир» — здесь появятся факты.`}
              </p>
            )}
            {!home && (
              <button type="button" className="link-btn" style={{ justifySelf: 'start' }} onClick={() => setEdit(true)}>
                Укажите домашний город — появится расстояние от дома и путь до поездок
              </button>
            )}
          </section>
        )}

        {(perYear.length > 0 || world.visitedCountryIds.size > 0) && (
          <section className="stack tight">
            <div className="section-title">
              <h2 className="h2">По годам</h2>
              {top && <span className="muted small num">рекорд — {top.year}</span>}
            </div>
            {perYear.length > 0 ? (
              <div className="list">
                {perYear.map((y) => (
                  <div key={y.year} className={`list-row year-row ${top?.year === y.year ? 'best' : ''}`}>
                    <b className="num year-num">{y.year}</b>
                    <div className="grow year-bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(6, (y.countries / (top?.countries ?? 1)) * 100)}%` }} />
                    </div>
                    <span className="num year-count">{countLabel(y.countries, 'страна', 'страны', 'стран')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="faint small" style={{ margin: 0 }}>
                Укажите год в карточке страны («Год посещения») — здесь появится, сколько стран вы посетили в каждом году.
              </p>
            )}
          </section>
        )}

        <AchSection
          title="Достижения"
          key={achMode}
          list={achMode === 'rider' ? hobbyStats.riderAch.map(fromHobby) : achMode === 'surf' ? hobbyStats.surfAch.map(fromHobby) : achievements.map(fromTravel)}
          switcher={<ModeSwitch label="Достижения чего" value={achMode} onChange={setAchMode} modes={hobbyModes} />}
        />

        <section className="list">
          <button type="button" className="list-row" onClick={() => go('trips')}>
            <Icon name="suitcase" size={20} />
            <span className="grow t">Мои поездки</span>
            <Icon name="chevron" size={18} />
          </button>
          <button type="button" className="list-row" onClick={() => go('countries')}>
            <Icon name="flagStack" size={20} />
            <span className="grow t">Страны</span>
            <Icon name="chevron" size={18} />
          </button>
          <button type="button" className="list-row" onClick={onSettings}>
            <Icon name="download" size={20} />
            <span className="grow">
              <span className="t block">Настройки и резервная копия</span>
              <span className="s block">Тема, валюта, курс, подсчёт стран, экспорт данных</span>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        </section>
      </div>

      {edit && <ProfileEditor onClose={() => setEdit(false)} homeName={home?.name ?? ''} />}
      {share && <ShareCardSheet onClose={() => setShare(false)} />}
    </div>
  );
}

function ProfileEditor({ onClose, homeName }: { onClose: () => void; homeName: string }) {
  const { settings } = useWorld();
  const [name, setName] = useState(settings.name);
  const [picking, setPicking] = useState(false);
  return (
    <Sheet
      title="Профиль"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn dark"
          onClick={async () => {
            await setSetting('name', name.trim());
            onClose();
          }}
        >
          Готово
        </button>
      }
    >
      <Field label="Имя">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как вас называть" maxLength={40} />
      </Field>
      <div className="field">
        <span>Домашний город</span>
        {picking ? (
          <PlaceSearch
            withCountries={false}
            placeholder="Город, откуда вы едете"
            onCity={async (p) => {
              const city = p.kind === 'catalog' ? catalogToCity(p.city) : p.city;
              await store.ensureCity(city);
              await setSetting('homeCityId', city.id);
              setPicking(false);
            }}
          />
        ) : (
          <button type="button" className="input left-btn" onClick={() => setPicking(true)}>
            {homeName || 'Выбрать город'}
          </button>
        )}
        <small className="faint" style={{ paddingLeft: 4 }}>
          Нужен для расстояний: сколько километров вы проехали и что дальше всего от дома.
        </small>
      </div>
      <div className="field">
        <span>Обращение</span>
        <Segmented
          label="Пол"
          value={settings.gender}
          onChange={(v) => void setSetting('gender', v)}
          options={[
            { value: 'male', label: 'Мужской' },
            { value: 'female', label: 'Женский' },
          ]}
        />
        <small className="faint" style={{ paddingLeft: 4 }}>
          Кнопки будут писать «{been(settings.gender).here}».
        </small>
      </div>
      <div className="field">
        <span>Паспорт</span>
        <Segmented
          label="Паспорт"
          value={settings.passport}
          onChange={(v) => void setSetting('passport', v)}
          options={[
            { value: 'RU', label: 'Россия' },
            { value: 'other', label: 'Другой' },
          ]}
        />
        <small className="faint" style={{ paddingLeft: 4 }}>
          По нему подсказки показывают визовый режим.
        </small>
      </div>
    </Sheet>
  );
}

function StatusCard({ countries }: { countries: number }) {
  const { status, next, toNext, progress } = travelerStatus(countries);
  return (
    <section className="status-card" aria-label="Статус">
      <span className="status-emoji" aria-hidden="true">
        {status.emoji}
      </span>
      <div className="grow stack tight">
        <span className="status-label">Статус</span>
        <b className="status-title">{status.title}</b>
        {next ? (
          <>
            <div className="meter thin">
              <i style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
            <span className="status-next">
              До следующего статуса — {countLabel(toNext, 'страна', 'страны', 'стран')}
            </span>
          </>
        ) : (
          <span className="status-next">Высший статус. Дальше — только вы.</span>
        )}
      </div>
    </section>
  );
}
