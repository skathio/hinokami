// Pace nudge (FR-17). Shifts the remaining schedule earlier/later in fixed increments by
// delegating to `store.applyNudge`, which delegates to the engine's D14 `reschedule` mechanism
// (`engine/progression.ts` → `engine/schedule.ts`) — this component never computes a reschedule
// itself.
//
// Review fix (pass 2): "was this nudge clamped?" is read from `store.lastNudgeClamped`, a real
// signal `reschedule` computes internally and the store passes straight through — NOT inferred
// here by diffing the current step's `clockStartTime` before/after the call. That heuristic
// under-fired: `reschedule` clamps each remaining step independently to the same
// `[0, targetTimeMs]` bounds, and the step closest to the target (typically the bake step, not
// the current step) clamps first, so the current step's own movement often looks unclamped even
// when the schedule as a whole was.

import { useState } from 'react';
import { useSessionStore } from '@/store/session';

const NUDGE_DELTAS_MINUTES = [-15, -5, 5, 15] as const;

export interface NudgePanelProps {
  onClose: () => void;
}

export default function NudgePanel({ onClose }: NudgePanelProps) {
  const session = useSessionStore((state) => state.session);
  const applyNudge = useSessionStore((state) => state.applyNudge);
  const lastNudgeClamped = useSessionStore((state) => state.lastNudgeClamped);
  // Gates the notice on "the user pressed a nudge button during this mount" so reopening the
  // panel later doesn't immediately show a notice left over from a previous press (this panel is
  // conditionally mounted/unmounted by `StepRunnerScreen`, but `lastNudgeClamped` itself lives on
  // the store and would otherwise still read `true` from before the remount).
  const [hasPressed, setHasPressed] = useState(false);

  const currentStep = session ? session.workflow[session.stepIndex] : undefined;

  function handleNudge(deltaMinutes: number): void {
    setHasPressed(true);
    applyNudge(deltaMinutes);
  }

  if (!currentStep) return null;

  const formattedTime = currentStep.clockStartTime.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="rounded-lg border border-charcoal-700 bg-charcoal-900 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-charcoal-200">Nudge pace</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close nudge panel"
          className="min-h-11 min-w-11 rounded-md text-charcoal-400 hover:text-charcoal-100"
        >
          ✕
        </button>
      </div>
      <p className="mt-1 text-sm text-charcoal-400">Next step time: {formattedTime}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {NUDGE_DELTAS_MINUTES.map((deltaMinutes) => (
          <button
            key={deltaMinutes}
            type="button"
            onClick={() => handleNudge(deltaMinutes)}
            className="min-h-11 min-w-11 rounded-md border border-charcoal-600 px-4 py-2 font-medium text-charcoal-100 hover:bg-charcoal-800"
          >
            {deltaMinutes > 0 ? `+${deltaMinutes}` : deltaMinutes} min
          </button>
        ))}
      </div>
      {hasPressed && lastNudgeClamped && (
        <p role="status" className="mt-2 text-sm text-amber-300">
          Can&apos;t go further in that direction.
        </p>
      )}
    </div>
  );
}
