import { useEffect, useState } from 'react';

/**
 * Push notices of ski resorts. The subscription (no personal data: the browser's push address and the resort ids)
 * lives in supabase/functions/myworld-push; the hourly feed run asks it to deliver fresh official notices.
 */
export const PUSH_URL = 'https://gpnpqwyniqmdinwazegh.supabase.co/functions/v1/myworld-push';
const VAPID_PUBLIC = 'BG0LGhqDbrAu88OvOZkP6wj_EYEjboAD5gFvihisoSdt9itkV_zU2TCtqnOIfxwFrT8RIhupzimLH1OjyCK2C4k';

export type PushState = 'unsupported' | 'install' | 'denied' | 'off' | 'on';

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) return isIos() && !standalone() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

const key = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function send(body: unknown): Promise<void> {
  const r = await fetch(PUSH_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`сервер уведомлений: ${r.status}`);
}

/** Asks permission (must run from a tap) and subscribes this phone to the given resorts. */
export async function enablePush(resorts: readonly string[]): Promise<PushState> {
  const st = await pushState();
  if (st === 'unsupported' || st === 'install' || st === 'denied') return st;
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const reg = await registration();
  if (!reg) return 'unsupported';
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(VAPID_PUBLIC) }));
  await send({ action: 'subscribe', subscription: sub.toJSON(), resorts });
  return 'on';
}

/** Keeps the server's list of resorts in step with «Сейчас тут» / notices switches. No list = no subscription. */
export async function syncPush(resorts: readonly string[]): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  if (resorts.length) await send({ action: 'subscribe', subscription: sub.toJSON(), resorts });
  else await send({ action: 'unsubscribe', endpoint: sub.endpoint });
}

export function usePushState(): [PushState | null, (s: PushState) => void] {
  const [st, setSt] = useState<PushState | null>(null);
  useEffect(() => {
    void pushState().then(setSt, () => setSt('unsupported'));
  }, []);
  return [st, setSt];
}
