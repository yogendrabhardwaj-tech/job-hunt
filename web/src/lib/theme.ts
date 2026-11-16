import { useEffect, useState } from 'react';

/** Colour themes. The colours themselves live in styles.css under :root[data-theme='…']. */
export const THEMES = {
  emerald: { label: 'Emerald', a: '#10b981', b: '#a3e635' },
  indigo: { label: 'Indigo', a: '#6366f1', b: '#22d3ee' },
  orchid: { label: 'Orchid', a: '#a855f7', b: '#f472b6' },
} as const;
export type ThemeKey = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeKey = 'emerald';

const STORAGE_KEY = 'jha-theme';
const EVENT = 'jha-theme-change';

export function readTheme(): ThemeKey {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in THEMES) return saved as ThemeKey;
  } catch {
    /* storage blocked: use the default */
  }
  return DEFAULT_THEME;
}

/** Call once at startup so the first paint already has the saved theme. */
export function applyTheme(key: ThemeKey = readTheme()) {
  document.documentElement.dataset.theme = key;
}

export function setTheme(key: ThemeKey) {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* not saved; still applies until the page reloads */
  }
  applyTheme(key);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
}

/** The current theme, kept in step across every switcher on the page and across tabs. */
export function useTheme() {
  const [theme, setLocal] = useState<ThemeKey>(readTheme);
  useEffect(() => {
    const onChange = () => setLocal(readTheme());
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return [theme, setTheme] as const;
}
