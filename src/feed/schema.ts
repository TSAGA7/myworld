import { z } from 'zod';

/**
 * Files of the «Лента» tab. They are built outside the app (GitHub Actions + a daily Claude task)
 * and published to the `data` branch of the repository; the app reads them from raw.githubusercontent.com.
 *   feed/news.json    — travel news from Telegram channels and sites, refreshed hourly
 *   feed/digest.json  — AI digest of the day (last 7 days kept)
 *   feed/deals.json   — tickets far below their usual price (Travelpayouts / Aviasales data), hourly
 *   feed/translations.json — Russian text of foreign news (Claude, morning and evening)
 *   feed/stories.json — fresh posts of author channels, hourly; feed/interesting.json — «Интересное», morning and evening
 */

export const TAGS = ['deal', 'visa', 'air', 'rail', 'hotel', 'rules'] as const;
export type Tag = (typeof TAGS)[number];
export const TAG_LABEL: Record<Tag, string> = {
  deal: 'Акции',
  visa: 'Визы и границы',
  air: 'Авиа',
  rail: 'Поезда',
  hotel: 'Отели',
  rules: 'Правила и сборы',
};

export const SourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['telegram', 'rss']),
  url: z.string(),
  /** Result of the last collection run: false = the source did not answer or could not be parsed. */
  ok: z.boolean(),
  error: z.string().optional(),
  /** Авиа / Ж/Д / Остальное and the kind of source (Авиакомпании, СМИ…), from src/feed/sources.ts. */
  section: z.string().optional(),
  group: z.string().optional(),
});
export type FeedSource = z.infer<typeof SourceSchema>;

export const NewsItemSchema = z.object({
  /** "<sourceId>:<post id>" */
  id: z.string(),
  sourceId: z.string(),
  url: z.string(),
  /** ISO time of publication. */
  at: z.string(),
  title: z.string(),
  /** Short excerpt (not the whole post): the original is one tap away. */
  text: z.string(),
  tags: z.array(z.enum(TAGS)),
  /** The same story found in other sources. */
  also: z.array(z.object({ sourceId: z.string(), url: z.string() })),
  /** Photo of the post, shown as is from the source (Telegram CDN or the site). */
  image: z.string().optional(),
  /** 'en' — a foreign source: shown once translations.json has its Russian text. */
  lang: z.literal('en').optional(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const NewsFileSchema = z.object({
  updatedAt: z.string(),
  sources: z.array(SourceSchema),
  items: z.array(NewsItemSchema),
});
export type NewsFile = z.infer<typeof NewsFileSchema>;

export const DigestEntrySchema = z.object({
  title: z.string().min(1),
  text: z.string().min(1),
  /** ids of news items the entry is based on: links are taken from news.json, never invented. */
  newsIds: z.array(z.string()).min(1),
  links: z.array(z.object({ name: z.string(), url: z.string() })).min(1),
});
export type DigestEntry = z.infer<typeof DigestEntrySchema>;

export const DigestSchema = z.object({
  /** Local (Moscow) date the digest covers, YYYY-MM-DD. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.string(),
  /** One line under the title. */
  lead: z.string(),
  main: z.array(DigestEntrySchema),
  other: z.array(DigestEntrySchema),
  sourcesCount: z.number().int().nonnegative(),
});
export type Digest = z.infer<typeof DigestSchema>;

export const DigestFileSchema = z.object({ updatedAt: z.string(), digests: z.array(DigestSchema) });
export type DigestFile = z.infer<typeof DigestFileSchema>;

export const DealSchema = z.object({
  /** origin-destination-departure date */
  id: z.string(),
  origin: z.string(),
  originName: z.string(),
  destination: z.string(),
  destinationName: z.string(),
  /** ISO 3166 alpha-2, '' when unknown. */
  countryCode: z.string(),
  price: z.number(),
  /** Usual price for this route and month. */
  usual: z.number(),
  /** Percent below the usual price, 0–100. */
  discount: z.number(),
  departAt: z.string(),
  transfers: z.number(),
  airline: z.string(),
  durationMin: z.number(),
  link: z.string(),
  /** First time the scanner saw this price. */
  foundAt: z.string(),
});
export type Deal = z.infer<typeof DealSchema>;

export const DealsFileSchema = z.object({
  updatedAt: z.string(),
  origins: z.array(z.object({ code: z.string(), name: z.string() })),
  deals: z.array(DealSchema),
});
export type DealsFile = z.infer<typeof DealsFileSchema>;

export const TranslationsFileSchema = z.object({
  updatedAt: z.string(),
  items: z.record(z.object({ title: z.string(), text: z.string() })),
});
export type TranslationsFile = z.infer<typeof TranslationsFileSchema>;

export const StoryItemSchema = z.object({
  /** ISO 3166 alpha-2 of the place, '' when it is not one country. */
  country: z.string(),
  /** "Япония", "Бали", "Урал" — shown in bold before the text. */
  place: z.string(),
  text: z.string(),
  storyIds: z.array(z.string()).min(1),
  /** Photo from the author's post. */
  image: z.string().optional(),
  /** Author channel(s) and the posts, from stories.json. */
  links: z.array(z.object({ name: z.string(), url: z.string() })).min(1),
});
export type StoryItem = z.infer<typeof StoryItemSchema>;

export const EditionSchema = z.object({
  /** "2026-11-01-morning" */
  id: z.string(),
  date: z.string(),
  part: z.enum(['morning', 'evening']),
  createdAt: z.string(),
  items: z.array(StoryItemSchema),
});
export type Edition = z.infer<typeof EditionSchema>;

export const InterestingFileSchema = z.object({ updatedAt: z.string(), editions: z.array(EditionSchema) });
export type InterestingFile = z.infer<typeof InterestingFileSchema>;
