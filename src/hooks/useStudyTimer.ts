import { useEffect, useRef } from 'react';

/**
 * Accumulates real time spent on a study page and flushes it via `onFlush`
 * periodically and on unmount — this is what makes the dashboard's "Study
 * Time" stat genuine rather than invented. Pauses while the tab is hidden so
 * a backgrounded tab doesn't inflate the total.
 */
export function useStudyTimer(onFlush: (ms: number) => void): void {
  const onFlushRef = useRef(onFlush);
  onFlushRef.current = onFlush;

  useEffect(() => {
    let lastTick = performance.now();

    const flush = () => {
      if (document.hidden) return;
      const now = performance.now();
      const elapsed = now - lastTick;
      lastTick = now;
      if (elapsed > 0) onFlushRef.current(elapsed);
    };

    const onVisibilityChange = () => {
      // Don't count the hidden interval; restart the clock on return.
      lastTick = performance.now();
    };

    const interval = window.setInterval(flush, 20_000);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      flush();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}
