// The hours the user is awake and able to act. The schedule solver keeps every step start inside
// them, so a recipe never asks anyone to get up (or stay up) at night. Saved with the other prefs.

import { setAwakeHours, usePrefs } from '@/prefs/prefs';

function minutesToTimeValue(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** A `time` input's `HH:MM` value → minutes since midnight; null while the field is cleared. */
function timeValueToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes < 24 * 60 ? minutes : null;
}

const INPUT_CLASS =
  'mt-1 min-h-11 w-full rounded-md border border-line bg-canvas px-3 py-2 text-lg text-ink focus:border-ember focus:ring-2 focus:ring-ember';

interface TimeFieldProps {
  id: string;
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
}

function TimeField({ id, label, minutes, onChange }: TimeFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={minutesToTimeValue(minutes)}
        onChange={(event) => {
          const next = timeValueToMinutes(event.target.value);
          if (next !== null) onChange(next);
        }}
        className={INPUT_CLASS}
      />
    </div>
  );
}

export default function AwakeHoursFieldset() {
  const { awakeStartMinute, awakeEndMinute } = usePrefs();
  return (
    <fieldset id="section-awake" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
      <legend className="px-2 font-display text-lg font-bold text-sun">Awake hours</legend>
      <p className="text-sm text-muted">
        Steps are only scheduled while you are up. If a ready time would need you to get up earlier or
        stay up later, we suggest the nearest one that works.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <TimeField
          id="awake-from"
          label="Awake from"
          minutes={awakeStartMinute}
          onChange={(minute) => setAwakeHours(minute, awakeEndMinute)}
        />
        <TimeField
          id="awake-until"
          label="Awake until"
          minutes={awakeEndMinute}
          onChange={(minute) => setAwakeHours(awakeStartMinute, minute)}
        />
      </div>
    </fieldset>
  );
}
