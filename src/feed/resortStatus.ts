import { z } from 'zod';

/**
 * Operational notices of ski resorts («трасса закрыта из-за ветра», «подъёмники остановлены», «открыли новые трассы»),
 * read from the resorts' official Telegram channels by scripts/feed/collect.ts → feed/resort-status.json.
 * A post becomes a notice only when its text clearly says so; anything else is ignored — no guessing, no invented alerts.
 */

export type StatusLevel = 'critical' | 'info';

const RULES: ReadonlyArray<{ level: StatusLevel; re: RegExp }> = [
  // Closed / stopped: runs, lifts, the whole resort; dangerous weather.
  { level: 'critical', re: /(закрыт[аоы]?|закрыли|закрывается|не работа[ею]т|остановлен[аоы]?|приостановлен[аоы]?|временно не|не запуска)[^.!?\n]{0,60}(трасс|подъ[её]мник|канатн|кресел|гондол|бугел|склон|курорт|катани)/i },
  { level: 'critical', re: /(трасс|подъ[её]мник|канатн|кресел|гондол|бугел|склон|катани)[^.!?\n]{0,60}(закрыт[аоы]?|не работа[ею]т|остановлен[аоы]?|приостановлен[аоы]?|отменен[оа]?|отменяется)/i },
  { level: 'critical', re: /(лавинн[а-я]* опасност|штормов[а-я]* предупрежд|ураганн|сильн[а-я]* ветр|метел|буран|экстренн)/i },
  { level: 'critical', re: /\b(closed|on (wind )?hold|not operating|suspended)\b[^.!?\n]{0,40}\b(lifts?|runs?|slopes?|gondola|resort)\b|\b(lifts?|runs?|slopes?|gondola)\b[^.!?\n]{0,40}\b(closed|on (wind )?hold|not operating|suspended)\b|avalanche (danger|warning)/i },
  // Good news and changes.
  { level: 'info', re: /(откры[лтв][а-я]*|запуска[ею]т|запустили|возобнов[а-я]*|начина[ею]т работу)[^.!?\n]{0,60}(трасс|подъ[её]мник|канатн|сезон|катани|склон|работу)/i },
  { level: 'info', re: /(снегопад|выпал[оа]? [^.!?\n]{0,20}снег|см (свежего )?снега|свежий снег|пауд[еэ]р)/i },
  { level: 'info', re: /(расписани|режим работы|часы работы|вечернее катание|ночное катание)/i },
  { level: 'info', re: /\b(now open|opening day|reopen|fresh snow|new snow|snowfall)\b/i },
];

/** Notice level of a post, or null when the post is not about the state of the runs and lifts. */
export function classifyStatus(text: string): StatusLevel | null {
  const t = text.replace(/\s+/g, ' ');
  for (const r of RULES) if (r.level === 'critical' && r.re.test(t)) return 'critical';
  for (const r of RULES) if (r.level === 'info' && r.re.test(t)) return 'info';
  return null;
}

/** Notices older than this are not news any more and are never shown as current. */
export const STATUS_FRESH_HOURS = { critical: 24, info: 72 } as const;

export const ResortNoticeSchema = z.object({
  /** "<channel>:<post id>" */
  id: z.string(),
  resortId: z.string(),
  level: z.enum(['critical', 'info']),
  /** Excerpt of the official post. */
  text: z.string(),
  url: z.string(),
  /** Publication time of the post (ISO). */
  at: z.string(),
  source: z.string(),
});
export type ResortNotice = z.infer<typeof ResortNoticeSchema>;

export const ResortSourceStateSchema = z.object({
  resortId: z.string(),
  channel: z.string(),
  /** official — checked by hand (resorts-extra.json); wikidata — the channel is listed in Wikidata. */
  verification: z.enum(['official', 'wikidata']),
  ok: z.boolean(),
  error: z.string().optional(),
  lastSyncAt: z.string().nullable(),
});
export type ResortSourceState = z.infer<typeof ResortSourceStateSchema>;

export const ResortStatusFileSchema = z.object({
  updatedAt: z.string(),
  sources: z.array(ResortSourceStateSchema),
  items: z.array(ResortNoticeSchema),
});
export type ResortStatusFile = z.infer<typeof ResortStatusFileSchema>;

/** Fresh notices of one resort, newest first; one per post, and an identical repost of the same text is dropped. */
export function currentNotices(items: readonly ResortNotice[], resortIds: ReadonlySet<string>, now: Date): ResortNotice[] {
  const seen = new Set<string>();
  return items
    .filter((n) => resortIds.has(n.resortId) && now.getTime() - Date.parse(n.at) <= STATUS_FRESH_HOURS[n.level] * 3_600_000 && Date.parse(n.at) <= now.getTime() + 600_000)
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((n) => {
      const k = `${n.resortId}|${n.text.toLowerCase().replace(/[^a-zа-яё0-9]+/g, ' ').trim().slice(0, 80)}`;
      if (seen.has(n.id) || seen.has(k)) return false;
      seen.add(n.id);
      seen.add(k);
      return true;
    });
}

/** «Сейчас тут» lasts this long; then the app asks whether you are still there. */
export const HERE_DAYS = 7;
