// The glanceable one-step runner (FR-7, NFR-5, NFR-6) — the screen a baker actually spends a bake
// looking at. Shows exactly the current step: its name, why it matters, its scheduled time, and
// (when the underlying stage carries a `cue`) an estimate framing, since fermentation times are
// never presented as precise (NFR-5). A single primary action ("Done — next step") advances;
// everything else (back, nudge, timeline, abandon) is secondary. Drives the wake-lock hook off
// `isStepActive` and renders the completion screen once the session's `status` flips to
// `'completed'` (`engine/progression.ts`'s `advance`).

import { useState } from 'react';
import { useSessionStore } from '@/store/session';
import { useWakeLock } from '@/hooks/useWakeLock';
import type { ScaledIngredient } from '@/engine';
import WakeLockHint from './WakeLockHint';
import NudgePanel from './NudgePanel';
import AbandonConfirmDialog from './AbandonConfirmDialog';
import TimelineOverview from './TimelineOverview';
import RecipeCard from './RecipeCard';
import CountdownTimer from './CountdownTimer';

const ESTIMATE_LABEL = 'Estimated — trust dough feel over the clock.';

function devWarn(message: string): void {
  if (import.meta.env.DEV) {
    // Dev-only observability (mirrors `store/session.ts`/`engine/persistence.ts`'s convention) —
    // never prod console noise.
    console.warn(`[hinokami:step-runner] ${message}`);
  }
}

/** Resolves a `HowStep`'s `ingredientRefs` against the store's `scaledIngredients` (iteration
 * 2.2, NF7: never a hardcoded gram figure). A ref with no match in `scaledIngredients` is
 * skipped — the caller renders the action text without a quantity for it (graceful, not a
 * crash) — and fires a `devWarn` naming the unresolved ref, since a mismatch here is a real
 * content bug (an `ingredientRefs` entry that doesn't match a `FormulaIngredient.name`), not an
 * expected runtime state. */
function resolveHowIngredientRefs(
  ingredientRefs: ReadonlyArray<string> | undefined,
  scaledIngredients: ReadonlyArray<ScaledIngredient> | null,
): ReadonlyArray<ScaledIngredient> {
  if (!ingredientRefs || ingredientRefs.length === 0) return [];
  const resolved: ScaledIngredient[] = [];
  for (const ref of ingredientRefs) {
    const match = scaledIngredients?.find((ingredient) => ingredient.name === ref);
    if (match) {
      resolved.push(match);
    } else {
      devWarn(`unresolved "how" ingredientRef "${ref}" — no matching scaledIngredients entry`);
    }
  }
  return resolved;
}

/** v1 is pizza-only (D3); `'bake'` is the pizza recipe's bake-stage id (`recipes/pizza/index.ts`).
 * `ScheduledStep` doesn't carry `Stage.type` — only `engine/schedule.ts` sees that at placement
 * time — so matching on `stageId` is the only signal available to the UI for "is this the bake
 * step." Documented v1 coupling, the same class as `store/session.ts`'s `toSessionPathway`; worth
 * revisiting (e.g. an engine-supplied `Step.isBakeStep` flag) if/when a second recipe's bake stage
 * needs a different id. */
const BAKE_STAGE_ID = 'bake';

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function StepRunnerScreen() {
  const session = useSessionStore((state) => state.session);
  const advanceStep = useSessionStore((state) => state.advanceStep);
  const backStep = useSessionStore((state) => state.backStep);
  const resetSession = useSessionStore((state) => state.resetSession);
  const scaledIngredients = useSessionStore((state) => state.scaledIngredients);

  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [recipeCardOpen, setRecipeCardOpen] = useState(false);

  // Called unconditionally, before any early return, per the rules of hooks — `isActive` is
  // `false` both when there's no session yet and once the bake completes, either of which
  // releases the lock via the hook's own cleanup (see `useWakeLock.ts`).
  const isActive = session !== null && session.status === 'in-progress';
  const { wakeLockUnavailable } = useWakeLock(isActive);

  // `App.tsx` only mounts this screen once a session exists (`view === 'runner'`); this guards
  // against the brief gap on a fresh mount / hot-reload, not a real reachable state.
  if (!session) return null;

  if (session.status === 'completed') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-charcoal-950 p-6 text-center text-charcoal-100">
        <h1 className="text-3xl font-bold">You&apos;re done — enjoy your pizza</h1>
        <button
          type="button"
          onClick={resetSession}
          className="min-h-11 rounded-md bg-ember-500 px-6 py-3 text-2xl font-semibold text-charcoal-950 hover:bg-ember-400"
        >
          Start a new bake
        </button>
      </main>
    );
  }

  const currentStep = session.workflow[session.stepIndex];
  const isBakeStep = currentStep.stageId === BAKE_STAGE_ID;
  // Iteration 1.2: the adapted bake temp/time renders unconditionally whenever
  // `bakeAdaptation` exists — previously only `.caveat` rendered, and only when present
  // (`session.ts:172` computes the spec, but the UI discarded it). `caveat` stays a separate,
  // narrower condition (present only for a best-effort 200-219 °C bake) — unchanged below.
  const bakeSpec = isBakeStep ? session.bakeAdaptation : undefined;
  const caveat = isBakeStep ? session.bakeAdaptation?.caveat : undefined;
  // Runner progress indicator (iteration 3.2): a filled bar reflecting how far through the
  // workflow the baker is. Deliberately `stepIndex / workflow.length` (not `+1`), per the phase
  // file's own formula — the bar fills as steps are completed, reaching 100% only once `advance`
  // flips `status` to `'completed'` and this component returns the completion screen instead.
  const progressPercent = Math.round((session.stepIndex / session.workflow.length) * 100);

  return (
    <main className="flex min-h-screen flex-col bg-charcoal-950 text-charcoal-100">
      <WakeLockHint visible={wakeLockUnavailable} />

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-between gap-6 p-6">
        <div>
          <p className="text-sm text-charcoal-400">
            Step {session.stepIndex + 1} of {session.workflow.length} · {formatClockTime(currentStep.clockStartTime)}
          </p>
          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Bake progress"
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-charcoal-800"
          >
            <div
              className="h-full rounded-full bg-ember-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <CountdownTimer />
          <h1 className="mt-2 text-3xl font-bold">{currentStep.name}</h1>
          <p className="mt-3 text-lg text-charcoal-300">{currentStep.why}</p>

          {currentStep.isEstimate && (
            <div className="mt-4 rounded-md border border-charcoal-700 bg-charcoal-900 p-4">
              <p className="text-sm font-medium text-charcoal-400">{ESTIMATE_LABEL}</p>
              {currentStep.cue && <p className="mt-1 text-charcoal-100">{currentStep.cue}</p>}
            </div>
          )}

          {currentStep.how && (
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-charcoal-100">
              {currentStep.how.map((howStep) => {
                const resolved = resolveHowIngredientRefs(howStep.ingredientRefs, scaledIngredients);
                return (
                  <li key={howStep.action}>
                    {resolved.length > 0 && (
                      <span className="font-medium text-charcoal-50">
                        {resolved.map((ingredient) => `${ingredient.grams}g ${ingredient.name}`).join(', ')}
                        :{' '}
                      </span>
                    )}
                    {howStep.action}
                  </li>
                );
              })}
            </ol>
          )}

          {bakeSpec && (
            <div className="mt-4 rounded-md border border-charcoal-700 bg-charcoal-900 p-4">
              <p className="text-lg font-semibold text-charcoal-100">
                {bakeSpec.bakeTempC}°C for {bakeSpec.bakeTimeMinutes} min
              </p>
            </div>
          )}

          {caveat && (
            <div
              role="note"
              aria-label="Bake caveat"
              className="mt-4 rounded-md border border-amber-700 bg-amber-950/40 p-4 text-amber-100"
            >
              <p>{caveat}</p>
            </div>
          )}

          {nudgeOpen && (
            <div className="mt-4">
              <NudgePanel onClose={() => setNudgeOpen(false)} />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={advanceStep}
            className="min-h-11 w-full rounded-md bg-ember-500 px-4 py-4 text-2xl font-semibold text-charcoal-950 hover:bg-ember-400"
          >
            Done — next step
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={backStep}
              className="min-h-11 flex-1 rounded-md border border-charcoal-600 px-4 py-2 font-medium text-charcoal-100 hover:bg-charcoal-800"
            >
              Go back
            </button>
            <button
              type="button"
              onClick={() => setNudgeOpen((open) => !open)}
              className="min-h-11 flex-1 rounded-md border border-charcoal-600 px-4 py-2 font-medium text-charcoal-100 hover:bg-charcoal-800"
            >
              Nudge pace
            </button>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRecipeCardOpen(true)}
              className="min-h-11 flex-1 rounded-md border border-charcoal-700 px-4 py-2 text-sm text-charcoal-300 hover:bg-charcoal-800"
            >
              Recipe
            </button>
            <button
              type="button"
              onClick={() => setTimelineOpen(true)}
              className="min-h-11 flex-1 rounded-md border border-charcoal-700 px-4 py-2 text-sm text-charcoal-300 hover:bg-charcoal-800"
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setAbandonOpen(true)}
              className="min-h-11 flex-1 rounded-md border border-charcoal-700 px-4 py-2 text-sm text-charcoal-400 hover:bg-charcoal-800"
            >
              Abandon bake
            </button>
          </div>
        </div>
      </div>

      {timelineOpen && (
        <TimelineOverview
          steps={session.workflow}
          currentStepIndex={session.stepIndex}
          onClose={() => setTimelineOpen(false)}
        />
      )}

      {recipeCardOpen && <RecipeCard onClose={() => setRecipeCardOpen(false)} />}

      {abandonOpen && <AbandonConfirmDialog onCancel={() => setAbandonOpen(false)} />}
    </main>
  );
}
