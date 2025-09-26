import { useEffect, useRef } from 'react';
import { useSessionStore } from '../store/session';

export function useCountdownSync() {
  const remainingMs = useSessionStore((s) => s.remainingMs);
  const lastMs = useRef<number>(remainingMs);

  useEffect(() => {
    lastMs.current = remainingMs;
  }, [remainingMs]);

  // This hook intentionally just forces subscription; the ticking is handled in store via bindSocketHandlers.
  return { remainingMs };
}
