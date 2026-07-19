// Minimal modal focus management (NFR-11, review Minor: Abandon/Timeline had none). On mount,
// moves focus into the dialog; while open, Escape closes it and Tab is trapped inside it so a
// keyboard user can't tab out onto the runner screen sitting behind the overlay. Deliberately not
// a general-purpose dialog primitive with restore-focus-on-close semantics — none of v1's modals
// need that: `AbandonConfirmDialog`'s confirm path navigates away from the runner entirely, and
// both its cancel path and `TimelineOverview`'s close just return to a screen the user was
// already looking at.

import { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useModalFocus<T extends HTMLElement>(onClose: () => void) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const initial = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (initial[0] ?? container).focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !container) return;

      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return containerRef;
}
