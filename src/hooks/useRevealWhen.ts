import { useEffect } from 'react';

/**
 * Scrolls an element into view and moves focus to it whenever `trigger` changes (and `enabled`).
 * The config screen's Generate button is pinned to the bottom, so what it reports — a banner at the
 * top, or an invalid field halfway up — is usually off-screen and the click looks like it did
 * nothing. `resolve` looks the element up at that moment, since it may not exist before then.
 */
export function useRevealWhen(
  resolve: () => HTMLElement | null | undefined,
  trigger: unknown,
  enabled: boolean,
): void {
  useEffect(() => {
    if (!enabled) return;
    const element = resolve();
    element?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    element?.focus({ preventScroll: true });
    // Re-run only when the trigger changes; `resolve` is a fresh closure every render.
  }, [trigger, enabled]);
}
