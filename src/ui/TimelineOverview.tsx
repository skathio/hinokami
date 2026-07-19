// Read-only timeline overview (FR-18, Could-priority — implemented since it's a thin read-only
// render over data the runner already has). Lists every stage in the session's workflow with its
// scheduled clock time. Purely informational: closing it returns to the runner unchanged, and
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

export default function TimelineOverview({ steps, currentStepIndex, onClose }: TimelineOverviewProps) {
  const containerRef = useModalFocus<HTMLDivElement>(onClose);

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Timeline overview"
      tabIndex={-1}
      className="fixed inset-0 z-10 flex flex-col bg-zinc-950 p-6 text-zinc-100"
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Timeline</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-zinc-600 px-4 py-2 font-medium text-zinc-100 hover:bg-zinc-800"
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
            return (
              <li
                key={step.stageId}
                className={`flex items-center justify-between rounded-md border p-3 ${
                  isCurrent ? 'border-zinc-400 bg-zinc-900' : 'border-zinc-800'
                }`}
              >
                <span className={isCurrent ? 'font-semibold text-zinc-100' : 'text-zinc-300'}>
                  {step.name}
                </span>
                <span className="text-sm text-zinc-400">{formattedTime}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
