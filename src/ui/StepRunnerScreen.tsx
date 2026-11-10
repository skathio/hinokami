// The glanceable one-step runner (FR-7, NFR-5, NFR-6) — the screen a baker actually spends a bake
// looking at. Shows exactly the current step: its name, why it matters, its scheduled time, and
// (when the underlying stage carries a `cue`) an estimate framing, since fermentation times are
// never presented as precise (NFR-5). A single primary action ("Done — next step") advances;
// everything else (back, nudge, recipe, timeline, abandon) is secondary. Drives the wake-lock hook off
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
import Wordmark from './Wordmark';
import ThemeToggle from './ThemeToggle';
import { formatClockTime, isOvernight } from './stepTime';

const ESTIMATE_LABEL = 'Estimated — trust dough feel over the clock.';

function devWarn(message: string): void {
  if (import.meta.env.DEV) {
    // Dev-only observability (mirrors `store/session.ts`/`engine/persistence.ts`'s convention) —
    // never prod console noise.
    console.warn(`[hinokami:step-runner] ${message}`);
  }
}

/** Resolves a `HowStep`'s `ingredientRefs` against the store's `scaledIngredients` (never a
 * hardcoded gram figure). A ref with no match in `scaledIngredients` is skipped — the caller
 * renders the action text without a quantity for it (graceful, not a crash) — and fires a
 * `devWarn` naming the unresolved ref, since a mismatch here is a real content bug (an
 * `ingredientRefs` entry that doesn't match a `FormulaIngredient.name`), not an expected runtime
 * state. */
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

const secondaryButton =
  'min-h-11 rounded-md border border-line px-1 py-2 text-sm font-medium leading-tight text-ink hover:bg-surface-2';

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
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-canvas p-6 text-center text-ink">
        <Wordmark className="text-3xl" />
        <h1 className="font-display text-4xl font-bold">You&apos;re done — enjoy your pizza</h1>
        <button
          type="button"
          onClick={resetSession}
          className="min-h-14 rounded-xl bg-ember px-8 py-3 text-2xl font-bold text-on-ember hover:brightness-110"
        >
          Start a new bake
        </button>
      </main>
    );
  }

  const currentStep = session.workflow[session.stepIndex];
  const isBakeStep = currentStep.stageId === BAKE_STAGE_ID;
  // The adapted bake temp/time renders whenever `bakeAdaptation` exists; `caveat` is narrower
  // (present only for a best-effort 200-219 °C bake).
  const bakeSpec = isBakeStep ? session.bakeAdaptation : undefined;
  const caveat = isBakeStep ? session.bakeAdaptation?.caveat : undefined;
  // Completed-steps fraction (`stepIndex / workflow.length`): it reaches 100% only once `advance`
  // flips `status` to `'completed'` and the completion screen renders instead.
  const progressPercent = Math.round((session.stepIndex / session.workflow.length) * 100);

  return (
    <main className="flex min-h-dvh flex-col bg-canvas text-ink">
      <WakeLockHint visible={wakeLockUnavailable} />

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-5 px-5 pt-3">
        <div className="flex items-center justify-between">
          <Wordmark className="text-xl" />
          <ThemeToggle />
        </div>

        {/* The rail below is the visual; this gives screen readers the overall percentage too. */}
        <div
          role="progressbar"
          aria-valuenow={progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Bake progress"
          className="sr-only"
        />
        <ol aria-label="Progress" className="flex gap-1.5">
          {session.workflow.map((step, index) => {
            const state = index < session.stepIndex ? 'done' : index === session.stepIndex ? 'current' : 'upcoming';
            return (
              <li
                key={step.stageId}
                aria-current={state === 'current' ? 'step' : undefined}
                className="flex-1"
              >
                <span
                  aria-hidden="true"
                  className={`block h-2 rounded-full ${
                    state === 'done' ? 'bg-ember' : state === 'current' ? 'bg-sun' : 'bg-line'
                  }`}
                />
                <span className="sr-only">
                  {step.name}, {state}
                </span>
              </li>
            );
          })}
        </ol>

        <div>
          <p className="text-base font-medium text-muted">
            Step {session.stepIndex + 1} of {session.workflow.length} ·{' '}
            <span className="font-semibold text-sun">{formatClockTime(currentStep.clockStartTime)}</span>
          </p>
          {isOvernight(currentStep) && (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent">
              <span aria-hidden="true">☾</span> Overnight step
            </p>
          )}
          <h1 className="mt-3 font-display text-5xl font-extrabold leading-[1.05] tracking-tight">
            {currentStep.name}
          </h1>
          {bakeSpec && (
            <div className="mt-4 rounded-xl border border-line bg-surface p-4">
              <p className="font-display text-3xl font-extrabold tracking-tight text-sun">
                {bakeSpec.bakeTempC}°C for {Math.round(bakeSpec.bakeTimeMinutes)} min
              </p>
            </div>
          )}

          <p className="mt-4 text-2xl leading-snug text-ink">{currentStep.why}</p>

          {currentStep.isEstimate && (
            <div className="mt-5 rounded-xl border border-line bg-surface p-4">
              <p className="text-sm font-medium text-muted">{ESTIMATE_LABEL}</p>
              {currentStep.cue && <p className="mt-1 text-xl text-ink">{currentStep.cue}</p>}
            </div>
          )}

          {currentStep.how && (
            <ol aria-label="How" className="mt-5 list-decimal space-y-3 pl-6 text-xl leading-snug text-ink marker:font-semibold marker:text-accent">
              {currentStep.how.map((howStep) => {
                const resolved = resolveHowIngredientRefs(howStep.ingredientRefs, scaledIngredients);
                return (
                  <li key={howStep.action}>
                    {resolved.length > 0 && (
                      <span className="font-semibold text-ink">
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

          {caveat && (
            <div
              role="note"
              aria-label="Bake caveat"
              className="mt-5 rounded-xl border border-caution bg-surface p-4 text-ink"
            >
              <p>{caveat}</p>
            </div>
          )}

          {nudgeOpen && (
            <div className="mt-5">
              <NudgePanel onClose={() => setNudgeOpen(false)} />
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-line bg-canvas pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto w-full max-w-lg space-y-3 px-5">
          <CountdownTimer />
          <button
            type="button"
            onClick={advanceStep}
            className="min-h-16 w-full rounded-xl bg-ember px-4 py-4 text-2xl font-bold text-on-ember hover:brightness-110"
          >
            Done — next step
          </button>
          <div className="grid grid-cols-5 gap-1.5">
            <button type="button" onClick={backStep} className={secondaryButton}>
              Go back
            </button>
            <button
              type="button"
              aria-expanded={nudgeOpen}
              onClick={() => setNudgeOpen((open) => !open)}
              className={secondaryButton}
            >
              Nudge pace
            </button>
            <button type="button" onClick={() => setRecipeCardOpen(true)} className={secondaryButton}>
              Recipe
            </button>
            <button type="button" onClick={() => setTimelineOpen(true)} className={secondaryButton}>
              Timeline
            </button>
            <button type="button" onClick={() => setAbandonOpen(true)} className={secondaryButton}>
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
