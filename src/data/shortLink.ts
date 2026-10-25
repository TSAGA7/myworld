import { b64url, decodeBundle, pipe, type TripBundle, unb64url } from './shareTrip';

/**
 * Short trip links: #/join/s/<id>.<key> instead of thousands of characters.
 * The trip is compressed, encrypted on the device (AES-GCM, random key) and kept at jsonblob.com, a free JSON store.
 * The key lives only in the link after «#», which browsers never send anywhere, so the store holds unreadable bytes.
 */
const STORE = 'https://jsonblob.com/api/jsonBlob';

const json = (b: TripBundle) => new TextEncoder().encode(JSON.stringify(b));

export async function createShortCode(b: TripBundle, fetcher: typeof fetch = fetch): Promise<string> {
  const packed = await pipe(json(b), new CompressionStream('deflate-raw'));
  const raw = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, packed as Uint8Array<ArrayBuffer>));
  const r = await fetcher(STORE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ app: 'myworld', v: 1, iv: b64url(iv), d: b64url(sealed) }),
  });
  if (!r.ok) throw new Error(`Сервис коротких ссылок ответил ${r.status}`);
  const loc = r.headers.get('x-jsonblob-id') ?? r.headers.get('location')?.split('/').pop() ?? '';
  if (!/^[\w-]{6,64}$/.test(loc)) throw new Error('Сервис коротких ссылок не вернул адрес');
  return `s/${loc}.${b64url(raw)}`;
}

export const isShortCode = (code: string): boolean => /^s\/[\w-]{6,64}\.[\w-]{16,}$/.test(code);

export async function openShortCode(code: string, fetcher: typeof fetch = fetch): Promise<TripBundle> {
  const m = code.match(/^s\/([\w-]+)\.([\w-]+)$/);
  if (!m) throw new Error('Ссылка повреждена');
  let r: Response;
  try {
    r = await fetcher(`${STORE}/${m[1]}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Нет интернета — короткая ссылка открывается только онлайн');
  }
  if (r.status === 404) throw new Error('Поездка по ссылке не найдена — возможно, ссылка устарела. Попросите прислать её заново.');
  if (!r.ok) throw new Error(`Не удалось загрузить поездку (${r.status})`);
  const body = (await r.json()) as { iv?: string; d?: string };
  if (!body.iv || !body.d) throw new Error('Это не поездка MY WORLD');
  try {
    const key = await crypto.subtle.importKey('raw', unb64url(m[2] as string) as Uint8Array<ArrayBuffer>, 'AES-GCM', false, ['decrypt']);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(body.iv) as Uint8Array<ArrayBuffer> }, key, unb64url(body.d) as Uint8Array<ArrayBuffer>));
    return decodeBundle(new TextDecoder().decode(await pipe(plain, new DecompressionStream('deflate-raw'))));
  } catch (e) {
    if (e instanceof Error && /MY WORLD/.test(e.message)) throw e;
    throw new Error('Ссылка повреждена');
  }
}
