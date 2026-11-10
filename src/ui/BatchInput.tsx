// Batch size — ball count + per-ball weight (FR-4/FR-12). One component per the phase file's
// component list since both fields describe the same "batch" concept; each still validates and
// reports errors independently.

import { useId } from 'react';

export interface BatchInputProps {
  ballCount: number | '';
  onChangeBallCount: (value: number | '') => void;
  onBlurBallCount?: () => void;
  ballCountMin: number;
  ballCountMax: number;
  ballCountError?: string;

  ballWeightG: number | '';
  onChangeBallWeight: (value: number | '') => void;
  onBlurBallWeight?: () => void;
  ballWeightMinG: number;
  ballWeightMaxG: number;
  ballWeightError?: string;
}

function parseNumericField(raw: string): number | '' | null {
  if (raw.trim() === '') return '';
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

export default function BatchInput({
  ballCount,
  onChangeBallCount,
  onBlurBallCount,
  ballCountMin,
  ballCountMax,
  ballCountError,
  ballWeightG,
  onChangeBallWeight,
  onBlurBallWeight,
  ballWeightMinG,
  ballWeightMaxG,
  ballWeightError,
}: BatchInputProps) {
  const countId = useId();
  const countErrorId = useId();
  const weightId = useId();
  const weightErrorId = useId();

  return (
    <div className="flex flex-wrap gap-4">
      <div>
        <label htmlFor={countId} className="block text-sm font-medium text-charcoal-200">
          Number of dough balls
        </label>
        <input
          id={countId}
          type="number"
          inputMode="numeric"
          step={1}
          value={ballCount}
          onChange={(event) => {
            const parsed = parseNumericField(event.target.value);
            if (parsed !== null) onChangeBallCount(parsed);
          }}
          onBlur={onBlurBallCount}
          aria-invalid={ballCountError ? true : undefined}
          aria-describedby={ballCountError ? countErrorId : undefined}
          // `charcoal-600` border — see `ConfigScreen.tsx`'s target-time input comment (not the
          // naive 1:1 `charcoal-700`, which measures below the 3:1 UI-boundary bar here).
          className="mt-1 min-h-11 w-24 rounded-md border border-charcoal-600 bg-charcoal-900 px-3 py-2 text-charcoal-100 focus:border-charcoal-400 focus:outline-none"
        />
        {/* `charcoal-400`, not a naive 1:1 `charcoal-500` — see `TemperatureInput.tsx`'s hint-text
            comment (4.38:1 fails the 4.5:1 body-text bar). */}
        <p className="mt-1 text-xs text-charcoal-400">
          {ballCountMin}–{ballCountMax} balls
        </p>
        {ballCountError && (
          <p id={countErrorId} role="alert" className="mt-1 text-sm text-red-400">
            {ballCountError}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={weightId} className="block text-sm font-medium text-charcoal-200">
          Weight per ball (g)
        </label>
        <input
          id={weightId}
          type="number"
          inputMode="decimal"
          value={ballWeightG}
          onChange={(event) => {
            const parsed = parseNumericField(event.target.value);
            if (parsed !== null) onChangeBallWeight(parsed);
          }}
          onBlur={onBlurBallWeight}
          aria-invalid={ballWeightError ? true : undefined}
          aria-describedby={ballWeightError ? weightErrorId : undefined}
          className="mt-1 min-h-11 w-28 rounded-md border border-charcoal-600 bg-charcoal-900 px-3 py-2 text-charcoal-100 focus:border-charcoal-400 focus:outline-none"
        />
        <p className="mt-1 text-xs text-charcoal-400">
          {ballWeightMinG}–{ballWeightMaxG} g
        </p>
        {ballWeightError && (
          <p id={weightErrorId} role="alert" className="mt-1 text-sm text-red-400">
            {ballWeightError}
          </p>
        )}
      </div>
    </div>
  );
}
