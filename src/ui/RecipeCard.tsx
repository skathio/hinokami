// Recipe Card (D2, iteration 1.2) — a secondary modal surfacing the ingredients/equipment/bake
// spec `generateWorkflow` already computes but the runner never showed: `scaledIngredients`
// (iteration 1.1, ephemeral store state — recomputed on rehydration rather than persisted, D5),
// the equipment implied by `session.inputs.hasStoneOrSteel`, and `session.bakeAdaptation`'s
// temp/time/dough guidance. Opened as a modal from `StepRunnerScreen`, following the exact
// pattern `TimelineOverview` establishes (`role="dialog"`, `aria-modal="true"`, `useModalFocus`
// for focus-trap + Escape-to-close) — the runner's own documented shape is "a single primary
// action; everything else is secondary" (`StepRunnerScreen.tsx` header comment), so this is a
// secondary modal affordance, not a persistent panel that would compete with that focus.
//
// Self-contained store reads (matching `AbandonConfirmDialog`/`NudgePanel`'s convention: this
// codebase's read-heavy components subscribe to the store themselves rather than taking every
// piece of session data as a prop) — `onClose` is the only prop, matching `TimelineOverview`.

import { useSessionStore } from '@/store/session';
import { useModalFocus } from '@/hooks/useModalFocus';

export interface RecipeCardProps {
  onClose: () => void;
}

export default function RecipeCard({ onClose }: RecipeCardProps) {
  const session = useSessionStore((state) => state.session);
  const scaledIngredients = useSessionStore((state) => state.scaledIngredients);
  const containerRef = useModalFocus<HTMLDivElement>(onClose);

  // `App.tsx` only mounts `StepRunnerScreen` (and thus this card) once a session exists; this
  // guards the brief gap on a fresh mount / hot-reload, not a real reachable state — same
  // convention as `NudgePanel`'s `if (!currentStep) return null`.
  if (!session) return null;

  const equipmentLabel = session.inputs.hasStoneOrSteel ? 'Pizza stone or steel' : 'Baking tray or pan';
  const bakeAdaptation = session.bakeAdaptation;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Recipe card"
      tabIndex={-1}
      className="fixed inset-0 z-10 flex flex-col bg-charcoal-950 p-6 text-charcoal-100"
    >
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Recipe</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-md border border-charcoal-600 px-4 py-2 font-medium text-charcoal-100 hover:bg-charcoal-800"
          >
            Close
          </button>
        </div>

        <div className="mt-4 flex-1 space-y-6 overflow-y-auto">
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-400">
              Ingredients
            </h3>
            {scaledIngredients && scaledIngredients.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {scaledIngredients.map((ingredient) => (
                  <li
                    key={ingredient.name}
                    className="flex items-center justify-between text-charcoal-100"
                  >
                    <span>{ingredient.name}</span>
                    <span className="text-charcoal-300">{ingredient.grams} g</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-charcoal-400">Ingredients unavailable for this session.</p>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-400">
              Equipment
            </h3>
            <p className="mt-2 text-charcoal-100">{equipmentLabel}</p>
          </section>

          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-charcoal-400">Bake</h3>
            {bakeAdaptation ? (
              <div className="mt-2 space-y-1 text-charcoal-100">
                <p>
                  {bakeAdaptation.bakeTempC}°C for {Math.round(bakeAdaptation.bakeTimeMinutes)} min
                </p>
                {bakeAdaptation.doughGuidance && (
                  <p className="text-sm text-charcoal-300">{bakeAdaptation.doughGuidance}</p>
                )}
              </div>
            ) : (
              <p className="mt-2 text-sm text-charcoal-400">Bake spec unavailable for this session.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
