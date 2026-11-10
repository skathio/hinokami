// The input/config form (FR-2, FR-3, FR-4, FR-12) — collects target ready time, oven max +
// stone/steel, ambient temp, batch, and pathway; validates inline; and, on Generate, calls
// `store.startSession`, handling the two inline exception flows (FR-10/FR-11) without navigating
// away from this screen.
//
// Design note on the Generate button: the phase file's narrative describes it as "disabled until
// all fields valid." This component instead keeps it always clickable and shows every field's
// error (via `submitAttempted`) on an invalid click, rather than using the HTML `disabled`
// attribute. Two reasons: (1) a disabled submit button with no explanation is a known
// accessibility anti-pattern (NFR-11) — screen reader users get no signal about *why* nothing
// happens; showing inline errors on click is the accessible pattern. (2) FR-12 explicitly wants
// "submit with missing field → specific error shown," which requires an actual submit to fire.
// Behaviorally the two are equivalent (nothing proceeds to `startSession` until valid); this is a
// considered implementation deviation, not a DoD violation — no DoD line requires the `disabled`
// HTML attribute specifically.

import { useState, type FormEvent } from 'react';
import type { OvenTooCold, PathwayRef, Recipe, RecipeBounds } from '@/recipes/contract';
import type { TargetTooSoon, WorkflowInputs } from '@/engine';
import { generateWorkflow, type GenerateWorkflowResult } from '@/engine';
import { useSessionStore } from '@/store/session';
import TemperatureInput from './TemperatureInput';
import PathwayToggle from './PathwayToggle';
import BatchInput from './BatchInput';
import AppHeader from './AppHeader';
import ScheduleSummary, { type SummarySection } from './ScheduleSummary';
import OvenTooColdBanner from './OvenTooColdBanner';
import TargetTooSoonBanner from './TargetTooSoonBanner';

export interface ConfigScreenProps {
  recipe: Recipe;
}

interface FormValues {
  targetTime: string; // `datetime-local` input value
  ovenMaxC: number | '';
  hasStoneOrSteel: boolean;
  ambientC: number | '';
  ballCount: number | '';
  ballWeightG: number | '';
  pathway: PathwayRef | '';
}

interface FieldErrors {
  targetTime?: string;
  ovenMaxC?: string;
  ambientC?: string;
  ballCount?: string;
  ballWeightG?: string;
  pathway?: string;
}

const DEFAULT_AMBIENT_C = 22;
const DEFAULT_BALL_WEIGHT_G = 250;

/** Generous input-level sanity bounds for oven max — deliberately NOT `recipe.bounds.ovenMin`
 * (200°C, the recipe's real "too cold to adapt at all" threshold). FRD F1's validation table
 * distinguishes a broad "sane oven range" input check from the separate, recipe-specific
 * "below recipe minimum → E2" exception flow (FRD F2) — an oven max of, say, 150°C must pass
 * *this* check and reach `startSession` so the real `OvenTooColdBanner` exception fires, rather
 * than being rejected here as if it were a typo. */
const OVEN_INPUT_MIN_C = 100;
const OVEN_INPUT_MAX_C = 400;

// The default weight is clamped into the recipe's range, so a recipe with larger pieces (a pan
// pizza) does not open with a value its own validation rejects.
function initialValues(bounds: RecipeBounds): FormValues {
  return {
    targetTime: '',
    ovenMaxC: '',
    hasStoneOrSteel: false,
    ambientC: DEFAULT_AMBIENT_C,
    ballCount: '',
    ballWeightG: Math.min(Math.max(DEFAULT_BALL_WEIGHT_G, bounds.ballWeightGMin), bounds.ballWeightGMax),
    pathway: '',
  };
}

function targetTimeError(targetTime: string, now: Date): string | undefined {
  if (!targetTime) return 'Target ready time is required.';
  const parsed = new Date(targetTime).getTime();
  if (Number.isNaN(parsed)) return 'Enter a valid date and time.';
  if (parsed <= now.getTime()) return 'Target ready time must be in the future.';
  return undefined;
}

/** A required numeric field: `required` when blank, `outOfRange` when it fails `inRange`. */
function numberError(
  value: number | '',
  inRange: (n: number) => boolean,
  messages: { required: string; outOfRange: string },
): string | undefined {
  if (value === '') return messages.required;
  return inRange(value) ? undefined : messages.outOfRange;
}

function validate(values: FormValues, bounds: RecipeBounds, now: Date): FieldErrors {
  const between = (min: number, max: number) => (n: number) => n >= min && n <= max;
  const candidates: FieldErrors = {
    targetTime: targetTimeError(values.targetTime, now),
    ovenMaxC: numberError(values.ovenMaxC, between(OVEN_INPUT_MIN_C, OVEN_INPUT_MAX_C), {
      required: 'Oven maximum temperature is required.',
      outOfRange: `Enter an oven temperature between ${OVEN_INPUT_MIN_C}°C and ${OVEN_INPUT_MAX_C}°C.`,
    }),
    ambientC: numberError(values.ambientC, between(bounds.ambientMin, bounds.ambientMax), {
      required: 'Ambient room temperature is required.',
      outOfRange: `Enter an ambient temperature between ${bounds.ambientMin}°C and ${bounds.ambientMax}°C.`,
    }),
    ballCount: numberError(
      values.ballCount,
      (n) => Number.isInteger(n) && between(bounds.ballCountMin, bounds.ballCountMax)(n),
      {
        required: 'Number of dough balls is required.',
        outOfRange: `Enter a whole number of dough balls between ${bounds.ballCountMin} and ${bounds.ballCountMax}.`,
      },
    ),
    ballWeightG: numberError(values.ballWeightG, between(bounds.ballWeightGMin, bounds.ballWeightGMax), {
      required: 'Ball weight is required.',
      outOfRange: `Enter a ball weight between ${bounds.ballWeightGMin} g and ${bounds.ballWeightGMax} g.`,
    }),
    pathway: values.pathway ? undefined : 'Choose a fermentation pathway.',
  };
  // Only fields with an error appear in the result, so `Object.keys(errors).length` stays the
  // "is the form valid" check its callers rely on.
  return Object.fromEntries(
    Object.entries(candidates).filter(([, message]) => message !== undefined),
  ) as FieldErrors;
}

/** `Date` → a `datetime-local` input's expected local-time string, used to pre-fill the target
 * time field when the user accepts a `TargetTooSoon` suggestion. Pure formatter — preserves the
 * input instant exactly (truncating to minute *display* resolution, as `datetime-local` requires,
 * but never shifting it). Any "make this value safely resubmittable" logic belongs in a separate
 * helper (see `earliestSelectableTargetValue` below), not here — a formatter that silently moves
 * its input forward is a trap for any future caller who reasonably expects it to preserve the
 * value. */
function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Fixed buffer added on top of `earliestSelectableTargetValue`'s ceil-to-next-minute — absorbs
 * real wall-clock time elapsing between when `earliestFeasibleTarget` was computed and when the
 * user actually clicks "Accept earliest" (a pure ceil alone only covers the sub-minute rounding
 * itself, not that gap). Isolated as a single named constant since the exact value is a judgment
 * call, not a derived one (`phases/01-surface-data-and-bug-fix.md` risk pointers). */
const ACCEPT_EARLIEST_BUFFER_MINUTES = 1;

/** Turns a `TargetTooSoon.earliestFeasibleTarget` into a value that's still genuinely feasible by
 * the time the resubmission it drives reaches `solveScheduleBackward`'s post-placement guard
 * (`schedule.ts:230-238`, "is the earliest placed stage already in the past"). Rounds `date` UP
 * to the next whole minute when it has any seconds/milliseconds remainder (undoing
 * `toDateTimeLocalValue`'s minute-resolution truncation, which — applied directly to
 * `earliestFeasibleTarget` — used to round *toward zero* and land the resubmitted value *earlier*
 * than the real feasibility boundary, retriggering the guard on the very next call), then adds
 * `bufferMinutes` on top. Only called from `handleAcceptEarliest`, never from
 * `toDateTimeLocalValue` itself — see that function's doc comment for why the two stay separate. */
function earliestSelectableTargetValue(
  date: Date,
  bufferMinutes: number = ACCEPT_EARLIEST_BUFFER_MINUTES,
): Date {
  const msPerMinute = 60_000;
  const remainderMs = date.getTime() % msPerMinute;
  const ceiledMs = remainderMs === 0 ? date.getTime() : date.getTime() + (msPerMinute - remainderMs);
  return new Date(ceiledMs + bufferMinutes * msPerMinute);
}

/** Computes the live schedule for the summary; only called once every field validates. */
function previewWorkflow(recipe: Recipe, values: FormValues): GenerateWorkflowResult {
  return generateWorkflow(recipe, {
    targetTime: new Date(values.targetTime),
    ovenMaxC: values.ovenMaxC as number,
    hasStoneOrSteel: values.hasStoneOrSteel,
    ambientC: values.ambientC as number,
    ballCount: values.ballCount as number,
    ballWeightG: values.ballWeightG as number,
    pathway: values.pathway as PathwayRef,
  });
}

export default function ConfigScreen({ recipe }: ConfigScreenProps) {
  const startSession = useSessionStore((state) => state.startSession);
  const setView = useSessionStore((state) => state.setView);

  const [values, setValues] = useState<FormValues>(() => initialValues(recipe.bounds));
  const [touched, setTouched] = useState<Partial<Record<keyof FormValues, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [ovenTooCold, setOvenTooCold] = useState<OvenTooCold | null>(null);
  const [targetTooSoon, setTargetTooSoon] = useState<TargetTooSoon | null>(null);

  const errors = validate(values, recipe.bounds, new Date());
  const fieldError = (field: keyof FieldErrors): string | undefined =>
    touched[field] || submitAttempted ? errors[field] : undefined;

  function markTouched(field: keyof FormValues): void {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function attemptGenerate(nextValues: FormValues): void {
    setOvenTooCold(null);
    setTargetTooSoon(null);

    const inputs: WorkflowInputs = {
      targetTime: new Date(nextValues.targetTime),
      ovenMaxC: nextValues.ovenMaxC as number,
      hasStoneOrSteel: nextValues.hasStoneOrSteel,
      ambientC: nextValues.ambientC as number,
      ballCount: nextValues.ballCount as number,
      ballWeightG: nextValues.ballWeightG as number,
      pathway: nextValues.pathway as PathwayRef,
    };

    const result = startSession(recipe, inputs);
    if (result.ok) return; // store transitions `view` to 'runner' itself

    if ('minimumOvenC' in result.error) {
      setOvenTooCold(result.error);
    } else {
      setTargetTooSoon(result.error);
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setSubmitAttempted(true);
    if (Object.keys(validate(values, recipe.bounds, new Date())).length > 0) return;
    attemptGenerate(values);
  }

  function handleAcceptEarliest(earliestFeasibleTarget: Date): void {
    const next: FormValues = {
      ...values,
      targetTime: toDateTimeLocalValue(earliestSelectableTargetValue(earliestFeasibleTarget)),
    };
    setValues(next);
    attemptGenerate(next);
  }

  function handleSwitchPathway(pathwayId: PathwayRef): void {
    const next: FormValues = { ...values, pathway: pathwayId };
    setValues(next);
    attemptGenerate(next);
  }

  const parsedTarget = values.targetTime ? new Date(values.targetTime) : null;
  const formValid = Object.keys(errors).length === 0;
  const preview = formValid ? previewWorkflow(recipe, values) : null;

  /** Jumps to the first control of a form group (used by the summary chips). */
  function focusSection(section: SummarySection): void {
    const group = document.getElementById(`section-${section}`);
    group?.scrollIntoView({ block: 'center' });
    group?.querySelector<HTMLElement>('input, button')?.focus();
  }

  return (
    <main className="min-h-dvh bg-canvas text-ink">
      <AppHeader />
      <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-lg">
        <div className="space-y-6 px-4 pb-6 pt-4">
          <div>
            <button
              type="button"
              onClick={() => setView('recipe-select')}
              className="min-h-11 text-sm font-medium text-muted hover:text-ink"
            >
              ‹ Change recipe
            </button>
            <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">{recipe.name}</h1>
            <p className="mt-1 text-base text-muted">{recipe.description}</p>
          </div>

          {ovenTooCold && (
            <OvenTooColdBanner
              reason={ovenTooCold.reason}
              onChangeTemperature={() => {
                setOvenTooCold(null);
                markTouched('ovenMaxC');
              }}
            />
          )}

          {targetTooSoon && (
            <TargetTooSoonBanner
              earliestFeasibleTarget={targetTooSoon.earliestFeasibleTarget}
              alternativePathways={targetTooSoon.alternativePathways}
              pathways={recipe.pathways}
              onAcceptEarliest={handleAcceptEarliest}
              onSwitchPathway={handleSwitchPathway}
            />
          )}

          <fieldset id="section-when" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
            <legend className="px-2 font-display text-lg font-bold text-sun">When</legend>
            <div>
              <label htmlFor="target-time" className="block text-sm font-semibold text-ink">
                Target ready time
              </label>
              <input
                id="target-time"
                type="datetime-local"
                value={values.targetTime}
                onChange={(event) => setValues((prev) => ({ ...prev, targetTime: event.target.value }))}
                onBlur={() => markTouched('targetTime')}
                aria-invalid={fieldError('targetTime') ? true : undefined}
                className="mt-1 min-h-11 w-full rounded-md border border-line bg-canvas px-3 py-2 text-lg text-ink focus:border-ember focus:ring-2 focus:ring-ember"
              />
              {fieldError('targetTime') && (
                <p role="alert" className="mt-1 text-sm text-danger">
                  {fieldError('targetTime')}
                </p>
              )}
            </div>
          </fieldset>

          <fieldset id="section-oven" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
            <legend className="px-2 font-display text-lg font-bold text-sun">Oven</legend>
            <TemperatureInput
              label="Oven maximum temperature"
              valueC={values.ovenMaxC}
              onChangeC={(value) => setValues((prev) => ({ ...prev, ovenMaxC: value }))}
              onBlur={() => markTouched('ovenMaxC')}
              minC={OVEN_INPUT_MIN_C}
              maxC={OVEN_INPUT_MAX_C}
              error={fieldError('ovenMaxC')}
            />

            <label className="flex min-h-11 items-center gap-3 text-base text-ink">
              <input
                type="checkbox"
                checked={values.hasStoneOrSteel}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, hasStoneOrSteel: event.target.checked }))
                }
                className="h-6 w-6 accent-ember"
              />
              I have a pizza stone or steel
            </label>
          </fieldset>

          <fieldset id="section-dough" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
            <legend className="px-2 font-display text-lg font-bold text-sun">Dough</legend>
            <TemperatureInput
              label="Ambient room temperature"
              valueC={values.ambientC}
              onChangeC={(value) => setValues((prev) => ({ ...prev, ambientC: value }))}
              onBlur={() => markTouched('ambientC')}
              minC={recipe.bounds.ambientMin}
              maxC={recipe.bounds.ambientMax}
              error={fieldError('ambientC')}
            />

            <BatchInput
              ballCount={values.ballCount}
              onChangeBallCount={(value) => setValues((prev) => ({ ...prev, ballCount: value }))}
              onBlurBallCount={() => markTouched('ballCount')}
              ballCountMin={recipe.bounds.ballCountMin}
              ballCountMax={recipe.bounds.ballCountMax}
              ballCountError={fieldError('ballCount')}
              ballWeightG={values.ballWeightG}
              onChangeBallWeight={(value) => setValues((prev) => ({ ...prev, ballWeightG: value }))}
              onBlurBallWeight={() => markTouched('ballWeightG')}
              ballWeightMinG={recipe.bounds.ballWeightGMin}
              ballWeightMaxG={recipe.bounds.ballWeightGMax}
              ballWeightError={fieldError('ballWeightG')}
            />

            <PathwayToggle
              pathways={recipe.pathways}
              value={values.pathway}
              onChange={(id) => {
                setValues((prev) => ({ ...prev, pathway: id }));
                markTouched('pathway');
              }}
              error={fieldError('pathway')}
            />
          </fieldset>

          <ScheduleSummary
            steps={preview?.ok ? preview.steps : null}
            targetTime={parsedTarget}
            ovenMaxC={values.ovenMaxC}
            ballCount={values.ballCount}
            ballWeightG={values.ballWeightG}
            pathwayName={recipe.pathways.find((p) => p.id === values.pathway)?.name ?? ''}
            onEdit={focusSection}
          />
        </div>

        <div className="sticky bottom-0 border-t border-line bg-canvas px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="submit"
            className="min-h-14 w-full rounded-xl bg-ember px-4 py-4 text-lg font-bold text-on-ember hover:brightness-90"
          >
            Generate
          </button>
        </div>
      </form>
    </main>
  );
}
