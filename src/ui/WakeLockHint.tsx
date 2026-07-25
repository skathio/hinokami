// Non-blocking hint shown when `useWakeLock` reports the Screen Wake Lock API is unavailable or
// was denied (NFR-7). Dismissible, and never gates the step flow — the bake continues exactly the
// same whether this is shown, dismissed, or never rendered at all.

import { useState } from 'react';

export interface WakeLockHintProps {
  visible: boolean;
}

export default function WakeLockHint({ visible }: WakeLockHintProps) {
  const [dismissed, setDismissed] = useState(false);

  if (!visible || dismissed) return null;

  return (
    <div
      role="status"
      className="flex items-start justify-between gap-4 border-b border-charcoal-700 bg-charcoal-900 px-4 py-3 text-sm text-charcoal-300"
    >
      <p>Your screen may dim — consider disabling auto-lock.</p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss wake-lock hint"
        className="min-h-11 min-w-11 shrink-0 rounded-md px-3 text-charcoal-400 hover:text-charcoal-100"
      >
        Dismiss
      </button>
    </div>
  );
}
