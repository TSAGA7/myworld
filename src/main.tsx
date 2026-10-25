import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme } from './app/theme';
import { ToastProvider } from './app/toast';
import { WorldProvider } from './app/world';
import { startUpdates } from './app/update';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { UpdatePrompt } from './ui/UpdateCard';
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
      <UpdatePrompt />
    </ErrorBoundary>
  </StrictMode>,
);

// Offline + updates: the service worker keeps the app in the cache; a new version waits for «Обновить» (production only).
if (import.meta.env.PROD) startUpdates();

// iOS: tapping outside a field closes the keyboard. Blurring on pointerdown over a button would close the keyboard
// before the tap ends: the page jumps under the finger and the tap is lost (a city in search results was not ticked).
// So buttons and links close it only after their click, and lists marked data-keep-keyboard leave it open.
const fieldFocused = (): HTMLElement | null => {
  const active = document.activeElement as HTMLElement | null;
  return active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) ? active : null;
};
const TAPPABLE = 'button, a, [role="button"], input, textarea, select, label';
document.addEventListener('pointerdown', (e) => {
  const active = fieldFocused();
  const target = e.target as HTMLElement | null;
  if (active && target && !target.closest(TAPPABLE)) active.blur();
});
document.addEventListener('click', (e) => {
  const active = fieldFocused();
  const target = e.target as HTMLElement | null;
  if (!active || !target || target.closest('input, textarea, select, label, [data-keep-keyboard]')) return;
  if (target.closest('button, a, [role="button"]')) active.blur();
});
