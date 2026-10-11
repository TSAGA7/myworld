/** Traveller status by the number of visited countries. Texts are part of the app's voice. */
export interface TravelerStatus {
  emoji: string;
  title: string;
  from: number;
  /** Last number of countries of this status; null for the top one. */
  to: number | null;
}

export const STATUSES: TravelerStatus[] = [
  { emoji: '🛋️', title: 'Тебе точно нужно это приложение?', from: 0, to: 0 },
  { emoji: '🏖️', title: 'Что там у тебя за страны из пакетных туров?', from: 1, to: 3 },
  { emoji: '🛫', title: 'Все, с кем мы ползали, пристегнитесь — мы взлетаем!', from: 4, to: 8 },
  { emoji: '🚶', title: 'Всё потихоньку', from: 9, to: 15 },
  { emoji: '💡', title: 'Наконец-то дошло, что за одну поездку можно закрывать сразу пару-тройку стран?', from: 16, to: 25 },
  { emoji: '🎯', title: 'Ну ты уже в целом серьёзный игрок', from: 26, to: 35 },
  { emoji: '🏆', title: 'Сильнейший, вопросов нет', from: 36, to: 50 },
  { emoji: '🦁', title: 'Зверюга! Так держать!', from: 51, to: null },
];

export function travelerStatus(countries: number): { status: TravelerStatus; next: TravelerStatus | null; toNext: number; progress: number } {
  const i = STATUSES.findIndex((s) => countries >= s.from && (s.to === null || countries <= s.to));
  const status = STATUSES[i] ?? (STATUSES[STATUSES.length - 1] as TravelerStatus);
  const next = STATUSES[i + 1] ?? null;
  const toNext = next ? next.from - countries : 0;
  const span = next ? next.from - status.from : 1;
  return { status, next, toNext, progress: next ? (countries - status.from) / span : 1 };
}
