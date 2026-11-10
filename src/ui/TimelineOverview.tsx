// Read-only timeline overview (FR-18, Could-priority — implemented since it's a thin read-only
// render over data the runner already has). Lists every stage in the session's workflow with its
// scheduled clock time and duration, plus the overall ready/eat time below the list (iteration
// 3.2, plan review F-5). Purely informational: closing it returns to the runner unchanged, and
// nothing here can advance/back/nudge the step index.
//
// Focus management (NFR-11, review Minor): `useModalFocus` moves focus in on mount, closes on
// Escape (same as the Close button), and traps Tab within the dialog.

import type { ScheduledStep } from '@/engine';
import { useModalFocus } from '@/hooks/useModalFocus';
import { formatClockTime, isOvernight } from './stepTime';

export interface TimelineOverviewProps {
  steps: ReadonlyArray<ScheduledStep>;
  currentStepIndex: number;
  onClose: () => void;
}

export default function TimelineOverview({ steps, currentStepIndex, onClose }: TimelineOverviewProps) {
  const containerRef = useModalFocus<HTMLDivElement>(onClose);

  // Target/ready-time marker (plan review F-5): the last remaining step's placed interval ends
  // exactly at `session.inputs.targetTime` by `solveScheduleBackward`'s own backward-placement
  // invariant (`reschedule`'s docstring, `engine/schedule.ts:258-259`) — so it's derived straight
  // from `steps` rather than threaded in as a separate prop. Guarded for an empty `steps` array
  // (not a reachable case from `StepRunnerScreen` today, but this component takes `steps` as a
  // prop, not a guaranteed-non-empty invariant of its own).
  const lastStep = steps.length > 0 ? steps[steps.length - 1] : undefined;
  const targetTime = lastStep
    ? new Date(lastStep.clockStartTime.getTime() + lastStep.durationMinutes * 60_000)
    : undefined;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Timeline overview"
      tabIndex={-1}
      className="fixed inset-0 z-10 flex flex-col bg-canvas p-6 text-ink"
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Timeline</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-line px-4 py-2 font-medium text-ink hover:bg-surface-2"
          >
            Close
          </button>
        </div>
        <ol className="mt-4 flex-1 space-y-2 overflow-y-auto">
          {steps.map((step, index) => {
            const isCurrent = index === currentStepIndex;
            const isDone = index < currentStepIndex;
            return (
              <li
                key={step.stageId}
                aria-current={isCurrent ? 'step' : undefined}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                  isCurrent ? 'border-ember bg-surface' : 'border-line'
                } ${isDone ? 'opacity-70' : ''}`}
              >
                <span className="min-w-0">
                  <span className={`block text-lg ${isCurrent ? 'font-bold text-ink' : 'text-ink'}`}>
                    {isDone && <span aria-hidden="true">✓ </span>}
                    {step.name}
                  </span>
                  {isOvernight(step) && (
                    <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">
                      <span aria-hidden="true">☾ </span>Overnight
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-base font-semibold text-sun">{formatClockTime(step.clockStartTime)}</span>
                  <span className="block text-sm text-muted">{Math.round(step.durationMinutes)} min</span>
                </span>
              </li>
            );
          })}
        </ol>
        {targetTime && (
          <p className="mt-4 border-t border-line pt-4 text-center text-base text-muted">
            Ready by <span className="font-semibold text-sun">{formatClockTime(targetTime)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
