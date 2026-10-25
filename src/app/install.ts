import { useEffect, useState } from 'react';

/**
 * «Установить приложение»: Chrome on Android fires beforeinstallprompt when the site can be installed;
 * the event is kept here and replayed by a button. iPhone has no such event — only «На экран Домой» by hand.
 */
interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const isStandalone = (): boolean =>
  typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

export type InstallPlatform = 'ios' | 'android' | 'other';
export const installPlatform = (): InstallPlatform => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
};

export function useInstall() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return {
    installed: isStandalone(),
    canPrompt: !!deferred,
    platform: installPlatform(),
    /** Shows the system install dialog; true when the user agreed. */
    prompt: async (): Promise<boolean> => {
      const e = deferred;
      if (!e) return false;
      deferred = null;
      notify();
      await e.prompt();
      return (await e.userChoice).outcome === 'accepted';
    },
  };
}
