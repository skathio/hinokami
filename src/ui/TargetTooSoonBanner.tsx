// FR-11 / FRD §F1 E1 exception flow — shown when the schedule solver determines the chosen
// pathway can't fit before the user's target time. Offers accepting the recomputed earliest
// feasible target, or switching to any pathway `alternativePathways` reports as actually feasible
// at the user's real (actual-ambient) kitchen conditions (`schedule.ts`'s `buildTargetTooSoon`).

import type { Pathway, PathwayRef } from '@/recipes/contract';

export interface TargetTooSoonBannerProps {
  earliestFeasibleTarget: Date;
  alternativePathways: ReadonlyArray<PathwayRef>;
  /** All of the recipe's pathways, to resolve `alternativePathways` ids to display names. */
  pathways: ReadonlyArray<Pathway>;
  onAcceptEarliest: (earliestFeasibleTarget: Date) => void;
  onSwitchPathway: (pathwayId: PathwayRef) => void;
}

export default function TargetTooSoonBanner({
  earliestFeasibleTarget,
  alternativePathways,
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
      <p className="font-medium">Your target time is too soon for this pathway</p>
      <p className="mt-1">The earliest feasible ready time for this pathway is {formattedEarliest}.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onAcceptEarliest(earliestFeasibleTarget)}
          className="min-h-11 rounded-md border border-caution px-4 py-2 font-medium text-ink hover:bg-surface-2"
        >
          Use {formattedEarliest}
        </button>
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
