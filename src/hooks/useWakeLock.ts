// Screen wake-lock (FR-8, NFR-7). Acquires `navigator.wakeLock.request('screen')` whenever the
// caller reports a step is active. On `visibilitychange`, explicitly releases the held sentinel
// when the tab goes to the background and re-acquires when it returns to the foreground while
// still active — the platform also force-releases a wake lock on backgrounding on its own, so the
// explicit release here is a deliberately deterministic (and testable) belt-and-braces mirror of
// that behavior, not a substitute for it. Never throws: an unsupported or denied API surfaces as
// `wakeLockUnavailable: true` so the UI can show a non-blocking hint (`WakeLockHint.tsx`) instead
// of the flow breaking.

import { useEffect, useRef, useState } from 'react';

export interface UseWakeLockResult {
  readonly wakeLockUnavailable: boolean;
}

function devWarn(message: string): void {
  if (import.meta.env.DEV) {
    // Dev-only observability (spec.md §8) — never prod console noise.
    console.warn(`[hinokami:useWakeLock] ${message}`);
  }
}

/**
 * @param isStepActive - true while the runner should keep the screen awake (derived from
 *   `isStepActive(session)` in `engine/progression.ts` and "not on the completion screen" —
 *   see `StepRunnerScreen.tsx`).
 */
export function useWakeLock(isStepActive: boolean): UseWakeLockResult {
  const [wakeLockUnavailable, setWakeLockUnavailable] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!isStepActive) {
      return;
    }

    let cancelled = false;

    async function acquire(): Promise<void> {
      if (!('wakeLock' in navigator) || !navigator.wakeLock) {
        // Feature-detect first (NFR-7) — e.g. Safari < 16.4, or any non-secure-context browser.
        setWakeLockUnavailable(true);
        return;
      }
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          // The effect was torn down (isStepActive flipped false, or unmount) while the request
          // was in flight — release immediately rather than holding a lock nothing wants anymore.
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
        setWakeLockUnavailable(false);
      } catch (error) {
        // Denied (e.g. low battery on some platforms) or unsupported at request time even though
        // `navigator.wakeLock` exists. try/catch per spec — never throw, never block the flow.
        devWarn(`acquire failed: ${String(error)}`);
        if (!cancelled) setWakeLockUnavailable(true);
      }
    }

    void acquire();

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        const sentinel = sentinelRef.current;
        sentinelRef.current = null;
        if (sentinel && !sentinel.released) {
          void sentinel.release().catch((error: unknown) => {
            devWarn(`release on visibility-hidden failed: ${String(error)}`);
          });
        }
      } else if (document.visibilityState === 'visible' && !sentinelRef.current) {
        // Re-acquire — the platform (or the branch above) already released it while backgrounded.
        void acquire();
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      if (sentinel && !sentinel.released) {
        void sentinel.release().catch((error: unknown) => {
          devWarn(`release failed: ${String(error)}`);
        });
      }
    };
  }, [isStepActive]);

  return { wakeLockUnavailable };
}
