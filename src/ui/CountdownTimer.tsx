// Live countdown for the runner's active step (D4 Option C, Phase 2 iteration 2.3). Self-contained
// against the store — same convention as `NudgePanel`/`RecipeCard`/`AbandonConfirmDialog` — rather
// than taking the step as a prop, so it never has to trust a caller to keep it fresh.
//
// Reactivity (plan review F-1): `clockStartTime`/`durationMinutes`/`isEstimate` are read from a
// LIVE store selector on *every* render, never captured once at mount or memoized independently of
// the store. The engine is fully immutable — `reschedule` (`engine/schedule.ts:291-296`) returns
// brand-new `ScheduledStep` objects and `applyNudge` (`engine/progression.ts:57-60`) builds a
// brand-new `workflow` array + session; nothing is mutated in place. A value captured once at mount
// would keep pointing at the pre-nudge object and silently go stale the moment a nudge replaces it.
// Selecting straight from `useSessionStore` on every render is what keeps this pointed at whichever
// step object is current.
//
// Independent of store changes, a `useEffect` + `setInterval` wall-clock tick (30s — coarse, since
// the displayed granularity is whole minutes and this runs on a phone screen during a bake) forces
// a re-render so "≈Nm left" keeps counting down as real time passes.

import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/session';

const TICK_INTERVAL_MS = 30_000;

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function CountdownTimer() {
  const session = useSessionStore((state) => state.session);
  // Guard the nullable session once; derive the current step in this local rather than
  // dereferencing `session` a second time below.
  const step = session ? session.workflow[session.stepIndex] : undefined;

  // The tick value itself is never read — its only job is to force a re-render every
  // `TICK_INTERVAL_MS` so `Date.now()` (used below) gets re-evaluated between store changes.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const intervalId = setInterval(() => forceTick((n) => n + 1), TICK_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, []);

  if (!step) return null;

  const endTime = new Date(step.clockStartTime.getTime() + step.durationMinutes * 60_000);
  const formattedEndTime = formatClockTime(endTime);

  // D4 Option C: an `isEstimate` step (a Q10-modeled fermentation) never shows a live
  // minute-by-minute count — that would present the model's output with false precision.
  // Consistent with `StepRunnerScreen`'s existing `ESTIMATE_LABEL` framing ("trust dough feel
  // over the clock").
  if (step.isEstimate) {
    return <p className="mt-1 text-sm text-charcoal-400">ends ~{formattedEndTime} (estimate)</p>;
  }

  const remainingMinutes = Math.max(0, Math.round((endTime.getTime() - Date.now()) / 60_000));

  return (
    <p className="mt-1 text-sm text-charcoal-400">
      ends ~{formattedEndTime} · ≈{remainingMinutes}m left
    </p>
  );
}
