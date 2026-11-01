// MY WORLD: push notices of ski resorts to subscribed phones.
//   POST {action:'subscribe', subscription, resorts:[ids]}  — from the app (stores / updates the subscription)
//   POST {action:'unsubscribe', endpoint}                   — from the app
//   POST {action:'notify'}                                  — from .github/workflows/feed.yml after each hourly run
// «notify» only delivers genuine notices from the published feed/resort-status.json, each one once per phone,
// so it needs no secret: calling it again sends nothing new. Tables: supabase/migrations/20261101_myworld_push.sql.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const DATA = 'https://raw.githubusercontent.com/TSAGA7/myworld/data/';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, apikey', 'access-control-allow-methods': 'POST, OPTIONS' };
/** A notice is pushed only while it is this fresh — a new subscriber does not get a pile of old ones. */
const PUSH_HOURS = 6;

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

type Notice = { id: string; resortId: string; level: 'critical' | 'info'; text: string; url: string; at: string; source: string };

async function config() {
  const { data, error } = await db.from('myworld_config').select('key,value');
  if (error) throw error;
  const c = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  webpush.setVapidDetails(c.vapid_subject, c.vapid_public, c.vapid_private);
}

async function notify() {
  await config();
  const [status, cat] = await Promise.all([
    fetch(`${DATA}feed/resort-status.json?t=${Date.now()}`).then((r) => (r.ok ? r.json() : { items: [] })),
    fetch(`${DATA}catalog/resorts.json?t=${Math.floor(Date.now() / 3_600_000)}`).then((r) => (r.ok ? r.json() : { items: [] })),
  ]);
  const names = new Map<string, string>((cat.items ?? []).map((r: { id: string; name: string; nameRu?: string | null }) => [r.id, r.nameRu || r.name]));
  const now = Date.now();
  const fresh: Notice[] = (status.items ?? []).filter((n: Notice) => now - Date.parse(n.at) <= PUSH_HOURS * 3_600_000);
  if (!fresh.length) return { sent: 0 };
  const { data: subs, error } = await db.from('myworld_push_subs').select('*').overlaps('resorts', [...new Set(fresh.map((n) => n.resortId))]);
  if (error) throw error;
  let sent = 0;
  for (const s of subs ?? []) {
    const mine = fresh.filter((n) => s.resorts.includes(n.resortId) && Date.parse(n.at) >= Date.parse(s.created_at) - 3_600_000);
    if (!mine.length) continue;
    const { data: done } = await db.from('myworld_push_sent').select('notice_id').eq('endpoint', s.endpoint).in('notice_id', mine.map((n) => n.id));
    const already = new Set((done ?? []).map((d) => d.notice_id));
    for (const n of mine.filter((x) => !already.has(x.id)).sort((a, b) => a.at.localeCompare(b.at))) {
      const title = `${n.level === 'critical' ? '⚠️ ' : ''}${names.get(n.resortId) ?? 'Курорт'}`;
      const body = `${n.text.length > 180 ? `${n.text.slice(0, 180)}…` : n.text}\n@${n.source}`;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, tag: n.id, url: `./#/countries/@resort/${encodeURIComponent(n.resortId)}` }), { TTL: 6 * 3600, urgency: n.level === 'critical' ? 'high' : 'normal' });
        await db.from('myworld_push_sent').insert({ endpoint: s.endpoint, notice_id: n.id });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // The phone unsubscribed or removed the app: forget the subscription.
        if (code === 404 || code === 410) {
          await db.from('myworld_push_subs').delete().eq('endpoint', s.endpoint);
          break;
        }
        console.error('push', code, (e as Error).message);
      }
    }
  }
  await db.from('myworld_push_sent').delete().lt('sent_at', new Date(now - 7 * 86_400_000).toISOString());
  return { sent };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  try {
    const body = await req.json();
    if (body.action === 'notify') return json(await notify());
    if (body.action === 'subscribe') {
      const s = body.subscription;
      const resorts = Array.isArray(body.resorts) ? body.resorts.filter((x: unknown) => typeof x === 'string').slice(0, 50) : [];
      if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth || !/^https:\/\//.test(s.endpoint)) return json({ error: 'bad subscription' }, 400);
      const { error } = await db.from('myworld_push_subs').upsert({ endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth, resorts, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ ok: true });
    }
    if (body.action === 'unsubscribe' && typeof body.endpoint === 'string') {
      await db.from('myworld_push_subs').delete().eq('endpoint', body.endpoint);
      return json({ ok: true });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
