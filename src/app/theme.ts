export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'myworld.theme';

export const getThemeChoice = (): ThemeChoice => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
};

export const isDark = (): boolean => document.documentElement.dataset.theme === 'dark';

export function applyTheme(): void {
  const c = getThemeChoice();
  let dark = c === 'dark';
  if (c === 'system') {
    try {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      dark = false;
    }
  }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  window.dispatchEvent(new Event('myworld-theme'));
}

export function setThemeChoice(c: ThemeChoice): void {
  try {
    if (c === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, c);
  } catch {
    /* private mode: the choice lasts until reload */
  }
  applyTheme();
}
