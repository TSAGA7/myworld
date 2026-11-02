// MY WORLD: starts the feed collector (.github/workflows/feed.yml) right now, without waiting for GitHub's schedule
// (GitHub runs «every hour» schedules hours late on free accounts).
//   GET                      — {configured, lastKick, lastSuccess}
//   POST {reason:'pull'}     — from the app («потянуть ленту вниз»): starts a run unless one was started < 10 min ago
//   POST {reason:'cron', key} — hourly from pg_cron (supabase/migrations/20261102_myworld_feed_kick.sql)
// Needs a GitHub token in myworld_config.gh_dispatch_token (fine-grained, repo TSAGA7/myworld, «Actions: Read and write»).
import { createClient } from 'npm:@supabase/supabase-js@2';

const REPO = 'TSAGA7/myworld';
const WORKFLOW = 'feed.yml';
const PULL_EVERY_MIN = 10;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, apikey', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

async function config(): Promise<Record<string, string>> {
  const { data, error } = await db.from('myworld_config').select('key,value').in('key', ['gh_dispatch_token', 'kick_key', 'last_kick', 'last_kick_ok']);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}
const save = (key: string, value: string) => db.from('myworld_config').upsert({ key, value });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const c = await config();
    if (req.method === 'GET') return json({ configured: !!c.gh_dispatch_token, lastKick: c.last_kick ?? null, lastSuccess: c.last_kick_ok ?? null });
    const body = (await req.json().catch(() => ({}))) as { reason?: string; key?: string };
    const cron = body.reason === 'cron';
    if (cron && (!c.kick_key || body.key !== c.kick_key)) return json({ started: false, reason: 'forbidden' }, 403);
    if (!c.gh_dispatch_token) return json({ started: false, reason: 'not_configured' });
    const now = Date.now();
    const last = c.last_kick ? Date.parse(c.last_kick) : 0;
    if (!cron && now - last < PULL_EVERY_MIN * 60_000) {
      return json({ started: false, reason: 'recent', lastKick: c.last_kick, retryAt: new Date(last + PULL_EVERY_MIN * 60_000).toISOString() });
    }
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      headers: { authorization: `Bearer ${c.gh_dispatch_token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'myworld-feed-kick' },
      body: JSON.stringify({ ref: 'main' }),
    });
    const at = new Date(now).toISOString();
    await save('last_kick', at);
    if (r.status !== 204) {
      const text = (await r.text()).slice(0, 300);
      console.error('dispatch', r.status, text);
      return json({ started: false, reason: r.status === 401 || r.status === 403 || r.status === 404 ? 'bad_token' : 'github_error', status: r.status });
    }
    await save('last_kick_ok', at);
    return json({ started: true, at });
  } catch (e) {
    console.error(e);
    return json({ started: false, reason: 'error' }, 500);
  }
});
