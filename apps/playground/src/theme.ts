/** docs/09 P1-T05: system / light / dark, remembered across reloads, class on `<html>`. */
export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'docs-playground-theme';
const THEMES: Theme[] = ['system', 'light', 'dark'];

export function readTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  return THEMES.find((theme) => theme === stored) ?? 'system';
}

const prefersDark = (): boolean => matchMedia('(prefers-color-scheme: dark)').matches;

/** Writes the choice and reflects the resolved theme as `.dark` on `<html>`. */
export function applyTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
  const dark = theme === 'dark' || (theme === 'system' && prefersDark());
  document.documentElement.classList.toggle('dark', dark);
  window.dispatchEvent(new Event(THEME_EVENT));
}

const THEME_EVENT = 'playground:theme';

/** The palette's Switch theme action changes it too, so the select follows rather than owns it. */
export function watchTheme(onChange: () => void): () => void {
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

/** Follows the OS while the choice is `system`; returns an unsubscribe. */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const query = matchMedia('(prefers-color-scheme: dark)');
  const onChange = (): void => {
    if (getTheme() === 'system') applyTheme('system');
  };
  query.addEventListener('change', onChange);
  return () => {
    query.removeEventListener('change', onChange);
  };
}
