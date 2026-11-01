/**
 * Where the «Лента» news come from. Telegram channels are read through the public preview t.me/s/<channel>
 * (no account, no key); sites through their RSS. The app shows a short excerpt and always links to the original.
 * A source that stops answering is marked ok=false in news.json and simply gives no items.
 */
export interface SourceDef {
  id: string;
  name: string;
  kind: 'telegram' | 'rss';
  /** Telegram channel name or RSS address. */
  ref: string;
}

export const SOURCES: readonly SourceDef[] = [
  { id: 'atorus', name: 'АТОР', kind: 'telegram', ref: 'atorus' },
  { id: 'samokatus', name: 'Самокатус', kind: 'telegram', ref: 'samokatus' },
  { id: 'aviasales', name: 'Aviasales', kind: 'telegram', ref: 'aviasales' },
  { id: 'vturisme', name: 'В Туризме', kind: 'telegram', ref: 'vturisme' },
  { id: 'telerzd', name: 'Телеграмма РЖД', kind: 'telegram', ref: 'telerzd' },
  { id: 'travelhacks', name: 'Travelhacks', kind: 'telegram', ref: 'travelhacks' },
  { id: 'flyextraspace', name: 'ExtraSpace', kind: 'telegram', ref: 'flyextraspace' },
  { id: 'journal_provodnika', name: 'Журнал проводника', kind: 'telegram', ref: 'journal_provodnika' },
  { id: 'tourdom', name: 'Турдом', kind: 'rss', ref: 'https://www.tourdom.ru/rss/' },
];

export const sourceUrl = (s: SourceDef): string => (s.kind === 'telegram' ? `https://t.me/s/${s.ref}` : s.ref);
