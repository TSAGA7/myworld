import { RIDER_LABEL, type RiderType } from '../../domain/hobby';
import { Segmented } from '../../ui/kit';

export type ProfileMode = 'travel' | 'rider' | 'surf';

/** «Путешествия | Борд | Сёрфинг»: travels plus the hobbies that are switched on. */
export function profileModes(rider: RiderType | null, surf: boolean): Array<{ value: ProfileMode; label: string }> {
  const m: Array<{ value: ProfileMode; label: string }> = [{ value: 'travel', label: 'Путешествия' }];
  if (rider) m.push({ value: 'rider', label: RIDER_LABEL[rider] });
  if (surf) m.push({ value: 'surf', label: 'Сёрфинг' });
  return m;
}

/** Small switch next to a section title; nothing when no hobby is on (travels only). */
export function ModeSwitch({ value, onChange, modes, label }: { value: ProfileMode; onChange: (v: ProfileMode) => void; modes: Array<{ value: ProfileMode; label: string }>; label: string }) {
  if (modes.length < 2) return null;
  return <Segmented label={label} className="mini" value={value} onChange={onChange} options={modes} />;
}
