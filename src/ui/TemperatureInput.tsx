// °C/°F unit selector over a canonically-°C-stored numeric field (NFR-14's stated exception —
// the one unit-selector case that's in scope for an otherwise English/metric-only v1). Used for
// both the oven-max and ambient-temperature fields in `ConfigScreen`; each call site owns its
// own bounds/error, this component only owns display-unit conversion.

import { useId } from 'react';
import { setUnit, usePrefs, type UnitPref } from '@/prefs/prefs';

export type TemperatureUnit = UnitPref;

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
  // The display unit is a shared preference (persisted outside the session store), so the oven
  // and ambient fields always agree and the choice survives reloads.
  const { unit } = usePrefs();
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
      <label htmlFor={inputId} className="block text-sm font-semibold text-ink">
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
          className="min-h-11 w-28 rounded-md border border-line bg-surface px-3 py-2 text-ink focus:border-ember"
        />
        <div role="group" aria-label={`${label} unit`} className="flex gap-1">
          <button
            type="button"
            aria-pressed={unit === 'C'}
            onClick={() => setUnit('C')}
            className={`min-h-11 min-w-11 rounded-md border px-3 text-sm ${
              unit === 'C' ? 'border-ember bg-ember text-on-ember' : 'border-line text-muted hover:text-ink'
            }`}
          >
            °C
          </button>
          <button
            type="button"
            aria-pressed={unit === 'F'}
            onClick={() => setUnit('F')}
            className={`min-h-11 min-w-11 rounded-md border px-3 text-sm ${
              unit === 'F' ? 'border-ember bg-ember text-on-ember' : 'border-line text-muted'
            }`}
          >
            °F
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-muted">
        Valid range: {minDisplay}°{unit}–{maxDisplay}°{unit}
      </p>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
