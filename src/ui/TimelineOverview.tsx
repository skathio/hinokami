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

export interface TimelineOverviewProps {
  steps: ReadonlyArray<ScheduledStep>;
  currentStepIndex: number;
  onClose: () => void;
}

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
      className="fixed inset-0 z-10 flex flex-col bg-charcoal-950 p-6 text-charcoal-100"
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Timeline</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-charcoal-600 px-4 py-2 font-medium text-charcoal-100 hover:bg-charcoal-800"
          >
            Close
          </button>
        </div>
        <ol className="mt-4 flex-1 space-y-2 overflow-y-auto">
          {steps.map((step, index) => {
            const isCurrent = index === currentStepIndex;
            return (
              <li
                key={step.stageId}
                className={`flex items-center justify-between rounded-md border p-3 ${
                  isCurrent ? 'border-ember-500 bg-charcoal-900' : 'border-charcoal-800'
                }`}
              >
                <span className={isCurrent ? 'font-semibold text-charcoal-100' : 'text-charcoal-300'}>
                  {step.name}
                </span>
                <span className="text-sm text-charcoal-400">
                  {formatClockTime(step.clockStartTime)} · {Math.round(step.durationMinutes)} min
                </span>
              </li>
            );
          })}
        </ol>
        {targetTime && (
          <p className="mt-4 border-t border-charcoal-800 pt-4 text-center text-sm text-charcoal-300">
            Ready by <span className="font-semibold text-charcoal-100">{formatClockTime(targetTime)}</span>
          </p>
        )}
      </div>
    </div>
  );
}
