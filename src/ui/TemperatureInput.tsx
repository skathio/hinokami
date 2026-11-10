// °C/°F unit selector over a canonically-°C-stored numeric field (NFR-14's stated exception —
// the one unit-selector case that's in scope for an otherwise English/metric-only v1). Used for
// both the oven-max and ambient-temperature fields in `ConfigScreen`; each call site owns its
// own bounds/error, this component only owns display-unit conversion.

import { useId, useState } from 'react';

export type TemperatureUnit = 'C' | 'F';

export interface TemperatureInputProps {
  label: string;
  /** Canonical value in °C — `''` means "empty" (required-field validation is the caller's job,
   * this component never invents a default). */
  valueC: number | '';
  onChangeC: (valueC: number | '') => void;
  onBlur?: () => void;
  /** Bounds, in °C, used only to render the "valid range" hint (converted to the active display
   * unit) — this component does not itself validate; `error`, if given, is shown verbatim. */
  minC: number;
  maxC: number;
  error?: string;
}

function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9;
}

/** Rounds for *display* only — the canonical `valueC` passed to `onChangeC` is never rounded, so
 * repeated unit toggling can't drift the underlying value. */
function roundForDisplay(value: number): number {
  return Math.round(value * 10) / 10;
}

export default function TemperatureInput({
  label,
  valueC,
  onChangeC,
  onBlur,
  minC,
  maxC,
  error,
}: TemperatureInputProps) {
  const [unit, setUnit] = useState<TemperatureUnit>('C');
  const inputId = useId();
  const errorId = useId();

  const displayValue =
    valueC === '' ? '' : String(roundForDisplay(unit === 'C' ? valueC : celsiusToFahrenheit(valueC)));

  function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
    const raw = event.target.value;
    if (raw.trim() === '') {
      onChangeC('');
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) return; // mid-typing invalid keystroke — ignore, don't propagate NaN
    onChangeC(unit === 'C' ? parsed : fahrenheitToCelsius(parsed));
  }

  const minDisplay = Math.round(unit === 'C' ? minC : celsiusToFahrenheit(minC));
  const maxDisplay = Math.round(unit === 'C' ? maxC : celsiusToFahrenheit(maxC));

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-charcoal-200">
        {label}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          // `charcoal-600` border, not the naive 1:1 `charcoal-700` — see `ConfigScreen.tsx`'s
          // target-time input comment for why (1.64:1 vs. 3.15:1 against this `charcoal-900` bg).
          className="min-h-11 w-28 rounded-md border border-charcoal-600 bg-charcoal-900 px-3 py-2 text-charcoal-100 focus:border-charcoal-400 focus:outline-none"
        />
        <div role="group" aria-label={`${label} unit`} className="flex gap-1">
          <button
            type="button"
            aria-pressed={unit === 'C'}
            onClick={() => setUnit('C')}
            className={`min-h-11 min-w-11 rounded-md border px-3 text-sm ${
              unit === 'C' ? 'border-charcoal-300 bg-charcoal-100 text-charcoal-950' : 'border-charcoal-700 text-charcoal-300'
            }`}
          >
            °C
          </button>
          <button
            type="button"
            aria-pressed={unit === 'F'}
            onClick={() => setUnit('F')}
            className={`min-h-11 min-w-11 rounded-md border px-3 text-sm ${
              unit === 'F' ? 'border-charcoal-300 bg-charcoal-100 text-charcoal-950' : 'border-charcoal-700 text-charcoal-300'
            }`}
          >
            °F
          </button>
        </div>
      </div>
      {/* `charcoal-400`, not a naive 1:1 `charcoal-500` — `charcoal-500` measures only 4.38:1
          against this `charcoal-950` page bg, below the 4.5:1 body-text bar (it's still fine as a
          decorative/border shade, just not for real text); `charcoal-400` is already verified at
          6.17:1 and reused here. */}
      <p className="mt-1 text-xs text-charcoal-400">
        Valid range: {minDisplay}°{unit}–{maxDisplay}°{unit}
      </p>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
