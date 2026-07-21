import { useCallback, useEffect, useState } from 'react';

/**
 * Light/dark theming. The user picks a preference; "system" follows the OS and
 * keeps following it if the OS flips while the app is open.
 *
 * The resolved theme is written to `<html data-theme>`, which is the single
 * switch every design token in tokens.css hangs off. index.html runs the same
 * resolution inline before first paint, so there's no flash of the wrong theme
 * on load — keep the two in sync if you change the storage key.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'lumina.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function readPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

function apply(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() =>
    readPreference() === 'system' ? systemTheme() : (readPreference() as ResolvedTheme),
  );

  // Apply on change, and keep tracking the OS while the preference is "system".
  useEffect(() => {
    const next = preference === 'system' ? systemTheme() : preference;
    setResolved(next);
    apply(next);

    if (preference !== 'system') return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => {
      const sys = systemTheme();
      setResolved(sys);
      apply(sys);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private browsing / storage disabled — theming still works for this session.
    }
  }, []);

  /** Flip to the opposite of what's on screen right now. */
  const toggle = useCallback(() => {
    setPreference(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setPreference]);

  return { preference, resolved, setPreference, toggle };
}
