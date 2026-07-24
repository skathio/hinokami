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
import WakeLockHint from './WakeLockHint';
import NudgePanel from './NudgePanel';
import AbandonConfirmDialog from './AbandonConfirmDialog';
import TimelineOverview from './TimelineOverview';
import RecipeCard from './RecipeCard';
import CountdownTimer from './CountdownTimer';

const ESTIMATE_LABEL = 'Estimated — trust dough feel over the clock.';

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
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-950 p-6 text-center text-zinc-100">
        <h1 className="text-3xl font-bold">You&apos;re done — enjoy your pizza</h1>
        <button
          type="button"
          onClick={resetSession}
          className="min-h-11 rounded-md bg-zinc-100 px-6 py-3 text-2xl font-semibold text-zinc-900 hover:bg-white"
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

  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <WakeLockHint visible={wakeLockUnavailable} />

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-between gap-6 p-6">
        <div>
          <p className="text-sm text-zinc-400">
            Step {session.stepIndex + 1} of {session.workflow.length} · {formatClockTime(currentStep.clockStartTime)}
          </p>
          <CountdownTimer />
          <h1 className="mt-2 text-3xl font-bold">{currentStep.name}</h1>
          <p className="mt-3 text-lg text-zinc-300">{currentStep.why}</p>

          {currentStep.isEstimate && (
            <div className="mt-4 rounded-md border border-zinc-700 bg-zinc-900 p-4">
              <p className="text-sm font-medium text-zinc-400">{ESTIMATE_LABEL}</p>
              {currentStep.cue && <p className="mt-1 text-zinc-100">{currentStep.cue}</p>}
            </div>
          )}

          {bakeSpec && (
            <div className="mt-4 rounded-md border border-zinc-700 bg-zinc-900 p-4">
              <p className="text-lg font-semibold text-zinc-100">
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
            className="min-h-11 w-full rounded-md bg-zinc-100 px-4 py-4 text-2xl font-semibold text-zinc-900 hover:bg-white"
          >
            Done — next step
          </button>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={backStep}
              className="min-h-11 flex-1 rounded-md border border-zinc-600 px-4 py-2 font-medium text-zinc-100 hover:bg-zinc-800"
            >
              Go back
            </button>
            <button
              type="button"
              onClick={() => setNudgeOpen((open) => !open)}
              className="min-h-11 flex-1 rounded-md border border-zinc-600 px-4 py-2 font-medium text-zinc-100 hover:bg-zinc-800"
            >
              Nudge pace
            </button>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRecipeCardOpen(true)}
              className="min-h-11 flex-1 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Recipe
            </button>
            <button
              type="button"
              onClick={() => setTimelineOpen(true)}
              className="min-h-11 flex-1 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Timeline
            </button>
            <button
              type="button"
              onClick={() => setAbandonOpen(true)}
              className="min-h-11 flex-1 rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
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
