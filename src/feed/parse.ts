import { decodeEntities, htmlToText } from './text.ts';

export interface RawPost {
  /** Post id inside the source. */
  id: string;
  url: string;
  at: string;
  text: string;
  /** RSS rubrics (<category>), for sources filtered by topic. */
  categories?: string[];
  /** First photo of the post (or a video preview). */
  image?: string;
}

/**
 * Public Telegram channel preview (https://t.me/s/<channel>): the last ~20 posts as HTML, no login or API key.
 * Posts without text (photo only, polls) are skipped.
 */
export function parseTelegram(html: string, channel: string): { title: string | null; posts: RawPost[] } {
  const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  const posts: RawPost[] = [];
  for (const block of html.split('tgme_widget_message_wrap').slice(1)) {
    const post = block.match(/data-post="([^"/]+)\/(\d+)"/);
    if (!post || post[1]?.toLowerCase() !== channel.toLowerCase()) continue;
    const id = post[2] as string;
    const start = block.search(/class="tgme_widget_message_text[^"]*js-message_text[^"]*"/);
    if (start < 0) continue;
    const body = block.slice(block.indexOf('>', start) + 1);
    const end = body.indexOf('</div>');
    const text = htmlToText(end >= 0 ? body.slice(0, end) : body);
    const at = block.match(/<time[^>]*datetime="([^"]+)"/)?.[1];
    if (!text || !at || Number.isNaN(Date.parse(at))) continue;
    const image = block.match(/tgme_widget_message_(?:photo_wrap|video_thumb)[^>]*background-image:url\('(https:[^']+)'\)/)?.[1];
    posts.push({ id, url: `https://t.me/${channel}/${id}`, at: new Date(at).toISOString(), text, ...(image ? { image } : {}) });
  }
  return { title: title ? decodeEntities(title) : null, posts };
}

const tag = (xml: string, name: string): string | undefined => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return undefined;
  return (m[1] as string).replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
};

/** RSS 2.0 and Atom. */
export function parseFeed(xml: string): { title: string | null; posts: RawPost[] } {
  const atom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blocks = xml.split(atom ? /<entry[\s>]/i : /<item[\s>]/i).slice(1);
  const head = xml.split(atom ? /<entry[\s>]/i : /<item[\s>]/i)[0] ?? '';
  const feedTitle = tag(head, 'title');
  const posts: RawPost[] = [];
  for (const b of blocks) {
    const link = atom ? (b.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? '') : (tag(b, 'link') ?? tag(b, 'guid') ?? '');
    const date = tag(b, 'pubDate') ?? tag(b, 'published') ?? tag(b, 'updated') ?? tag(b, 'dc:date');
    const title = htmlToText(htmlToText(tag(b, 'title') ?? ''));
    const body = htmlToText(htmlToText(tag(b, 'description') ?? tag(b, 'summary') ?? tag(b, 'content') ?? tag(b, 'yandex:full-text') ?? ''));
    const url = decodeEntities(link).trim();
    if (!url.startsWith('http') || !date || Number.isNaN(Date.parse(date)) || !title) continue;
    const categories = [...b.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => htmlToText((m[1] as string).replace(/^<!\[CDATA\[|\]\]>$/g, '')));
    const raw = tag(b, 'description') ?? tag(b, 'content:encoded') ?? '';
    const image = decodeEntities(
      b.match(/<(?:media:content|media:thumbnail|enclosure)[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)?.[1] ?? b.match(/<enclosure[^>]*type="image[^"]*"[^>]*url="([^"]+)"/i)?.[1] ?? decodeEntities(raw).match(/<img[^>]*src="(https:[^"]+)"/i)?.[1] ?? '',
    );
    posts.push({ id: url, url, at: new Date(date).toISOString(), text: body && !body.startsWith(title) ? `${title}\n${body}` : body || title, categories, ...(image.startsWith('https:') ? { image } : {}) });
  }
  return { title: feedTitle ? htmlToText(feedTitle) : null, posts };
}
