// «Проверить цену» for a deal in the app: asks Travelpayouts for the cheapest ticket on that exact day right now.
// The token stays here (secret TRAVELPAYOUTS_TOKEN), never in the app.
// GET /functions/v1/price-check?origin=MOW&destination=BJS&date=2026-12-10
// → { price, departAt, transfers, airline, link, checkedAt } or { price: null } when nothing is on sale that day.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const token = Deno.env.get('TRAVELPAYOUTS_TOKEN');
  if (!token) return json({ error: 'TRAVELPAYOUTS_TOKEN не задан' }, 503);
  const u = new URL(req.url);
  const origin = u.searchParams.get('origin') ?? '';
  const destination = u.searchParams.get('destination') ?? '';
  const date = u.searchParams.get('date') ?? '';
  if (!/^[A-Z]{3}$/.test(origin) || !/^[A-Z]{3}$/.test(destination) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'Нужны origin, destination (IATA) и date (YYYY-MM-DD)' }, 400);

  const q = new URLSearchParams({ origin, destination, departure_at: date, one_way: 'true', direct: 'false', sorting: 'price', currency: 'rub', market: 'ru', limit: '5', page: '1' });
  const r = await fetch(`https://api.travelpayouts.com/aviasales/v3/prices_for_dates?${q}`, { headers: { 'x-access-token': token } });
  if (!r.ok) return json({ error: `Travelpayouts ${r.status}` }, 502);
  const body = (await r.json()) as { data?: Array<{ price: number; departure_at: string; transfers?: number; airline?: string; link?: string }> };
  const best = (body.data ?? []).sort((a, b) => a.price - b.price)[0];
  const marker = Deno.env.get('TRAVELPAYOUTS_MARKER') ?? '';
  const link = best?.link ? `https://www.aviasales.ru${best.link}${marker ? `${best.link.includes('?') ? '&' : '?'}marker=${encodeURIComponent(marker)}` : ''}` : null;
  return json({
    price: best ? Math.round(best.price) : null,
    departAt: best?.departure_at ?? null,
    transfers: best?.transfers ?? null,
    airline: best?.airline ?? null,
    link,
    checkedAt: new Date().toISOString(),
  });
});
