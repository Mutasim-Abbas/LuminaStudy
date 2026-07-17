import { useEffect, useState } from 'react';

/**
 * Persisted state backed by localStorage. Lumina Study has no backend yet, so
 * this is how courses/semesters survive a reload. Falls back silently if
 * storage is unavailable (private browsing, quota).
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — persistence is best-effort */
    }
  }, [key, value]);

  return [value, setValue];
}
