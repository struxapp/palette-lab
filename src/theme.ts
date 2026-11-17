export type Theme = 'light' | 'dark';

const KEY = 'palette-lab:theme';

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the app works without it.
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme(): Theme {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return systemTheme();
}

export function initTheme(onChange: (theme: Theme) => void): () => void {
  const stored = readStored(KEY);
  if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => onChange(currentTheme()));
  onChange(currentTheme());
  return () => {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    writeStored(KEY, next);
    onChange(next);
  };
}
