// Read-only timeline overview (FR-18, Could-priority — implemented since it's a thin read-only
// render over data the runner already has). Lists every stage in the session's workflow with its
// scheduled clock time. Purely informational: closing it returns to the runner unchanged, and
// nothing here can advance/back/nudge the step index.
//
// Focus management (NFR-11, review Minor): `useModalFocus` moves focus in on mount, closes on
// Escape (same as the Close button), and traps Tab within the dialog.

import type { ScheduledStep } from '@/engine';
import { useModalFocus } from '@/hooks/useModalFocus';
import { isOvernight } from './stepTime';

export interface TimelineOverviewProps {
  steps: ReadonlyArray<ScheduledStep>;
  currentStepIndex: number;
  onClose: () => void;
}

export default function TimelineOverview({ steps, currentStepIndex, onClose }: TimelineOverviewProps) {
  const containerRef = useModalFocus<HTMLDivElement>(onClose);

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
            const formattedTime = step.clockStartTime.toLocaleTimeString(undefined, {
              hour: 'numeric',
              minute: '2-digit',
            });
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
                <span className="shrink-0 text-base font-semibold text-sun">{formattedTime}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
