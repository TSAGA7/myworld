const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const page = 'https://krasnayapolyanaresort.ru/webcams/540-1';
const r = await fetch(page, { headers: { 'user-agent': UA } });
const html = await r.text();
console.log('PAGE', r.status, html.length);
for (const m of html.matchAll(/.{0,300}\.m3u8.{0,200}/g)) console.log('CTX', m[0].replace(/\s+/g, ' ').slice(0, 520));
const urls = [...new Set([...html.matchAll(/https?:[^"'\s<>]+?\.m3u8[^"'\s<>]*/gi)].map((m) => m[0]))];
console.log('URLS', urls.slice(0, 3));
const clean = urls.map((u) => u.replace(/\\\//g, '/').replace(/\\+$/, '')).slice(0, 2);
for (const u of clean) {
  for (const ref of [null, 'https://krasnayapolyanaresort.ru/', 'https://tsaga7.github.io/']) {
    try {
      const h: Record<string, string> = { 'user-agent': UA };
      if (ref) { h.referer = ref; h.origin = new URL(ref).origin; }
      const x = await fetch(u, { headers: h, signal: AbortSignal.timeout(10000) });
      const t = await x.text();
      console.log('M3U8', u, 'ref', ref, x.status, 'acao', x.headers.get('access-control-allow-origin'), t.slice(0, 120).replace(/\n/g, ' | '));
    } catch (e) { console.log('M3U8 ERR', u, ref, String(e)); }
  }
}
for (const u of ['http://hls.kts42.ru:45125/green/mono.m3u8', 'https://hls.kts42.ru:45125/green/mono.m3u8']) {
  try { const x = await fetch(u, { signal: AbortSignal.timeout(8000) }); console.log('SHER', u, x.status, x.headers.get('access-control-allow-origin')); } catch (e) { console.log('SHER ERR', u, String(e)); }
}
const list = await (await fetch('https://krasnayapolyanaresort.ru/webcams', { headers: { 'user-agent': UA } })).text();
console.log('LIST', list.length);
for (const m of list.matchAll(/.{0,200}(webcams\/[0-9a-z-]+).{0,200}/g)) console.log('LCTX', m[0].replace(/\s+/g, ' ').slice(0, 400));
