// FR-11 / FRD §F1 E1 exception flow — shown when the schedule solver determines the chosen
// pathway can't fit before the user's target time. Offers accepting the recomputed earliest
// feasible target, or switching to any pathway `alternativePathways` reports as actually feasible
// at the user's real (actual-ambient) kitchen conditions (`schedule.ts`'s `buildTargetTooSoon`).

import type { Pathway, PathwayRef } from '@/recipes/contract';

export interface TargetTooSoonBannerProps {
  earliestFeasibleTarget: Date;
  alternativePathways: ReadonlyArray<PathwayRef>;
  /** The target fits the clock but a step would land outside the user's awake hours. */
  blockedByAwakeHours?: boolean;
  /** No ready time in the next few days fits the awake hours for this pathway. */
  awakeHoursTooNarrow?: boolean;
  /** All of the recipe's pathways, to resolve `alternativePathways` ids to display names. */
  pathways: ReadonlyArray<Pathway>;
  onAcceptEarliest: (earliestFeasibleTarget: Date) => void;
  onSwitchPathway: (pathwayId: PathwayRef) => void;
}

export default function TargetTooSoonBanner({
  earliestFeasibleTarget,
  alternativePathways,
  blockedByAwakeHours,
  awakeHoursTooNarrow,
  pathways,
  onAcceptEarliest,
  onSwitchPathway,
}: TargetTooSoonBannerProps) {
  const formattedEarliest = earliestFeasibleTarget.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div
      role="alert"
      className="rounded-md border border-caution bg-surface p-4 text-sm text-ink"
    >
      <p className="font-medium">
        {blockedByAwakeHours || awakeHoursTooNarrow
          ? 'This ready time would have you up outside your awake hours'
          : 'Your target time is too soon for this pathway'}
      </p>
      <p className="mt-1">
        {awakeHoursTooNarrow
          ? 'No ready time in the next few days fits this pathway into your awake hours. Widen them, or try another pathway.'
          : blockedByAwakeHours
            ? `The nearest ready time that keeps every step within your awake hours is ${formattedEarliest}.`
            : `The earliest feasible ready time for this pathway is ${formattedEarliest}.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!awakeHoursTooNarrow && (
        <button
          type="button"
          onClick={() => onAcceptEarliest(earliestFeasibleTarget)}
          className="min-h-11 rounded-md border border-caution px-4 py-2 font-medium text-ink hover:bg-surface-2"
        >
          Use {formattedEarliest}
        </button>
        )}
        {alternativePathways.map((pathwayId) => {
          const pathway = pathways.find((p) => p.id === pathwayId);
          return (
            <button
              key={pathwayId}
              type="button"
              onClick={() => onSwitchPathway(pathwayId)}
              className="min-h-11 rounded-md border border-caution px-4 py-2 font-medium text-ink hover:bg-surface-2"
            >
              Switch to {pathway?.name ?? pathwayId}
            </button>
          );
        })}
      </div>
    </div>
  );
}
