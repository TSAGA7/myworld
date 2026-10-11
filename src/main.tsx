import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme } from './app/theme';
import { ToastProvider } from './app/toast';
import { WorldProvider } from './app/world';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles/tokens.css';
import './styles/app.css';
import './styles/screens.css';

applyTheme();
try {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
} catch {
  /* old browser: theme applied once */
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <ErrorBoundary>
      <WorldProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </WorldProvider>
    </ErrorBoundary>
  </StrictMode>,
);

// Offline: the service worker keeps the app, geodata and flags in the cache (production build only).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => undefined);
  });
}

// iOS: tapping outside a field closes the keyboard.
document.addEventListener('pointerdown', (e) => {
  const active = document.activeElement as HTMLElement | null;
  const target = e.target as HTMLElement | null;
  if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && target && !target.closest('input, textarea, select, label')) active.blur();
});
