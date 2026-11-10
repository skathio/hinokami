// Live schedule summary for the config screen. Leads with the computed start time (the answer to
// "when do I begin?"), flags overnight steps, and lists the settings behind it as chips; each chip
// jumps to that setting so one value can be changed without re-entering the rest.

import type { ScheduledStep } from '@/engine';
import { usePrefs } from '@/prefs/prefs';
import { formatClockTime, isOvernight } from './stepTime';

export type SummarySection = 'when' | 'oven' | 'dough';

export interface ScheduleSummaryProps {
  /** `null` until every field is valid and a schedule can be computed. */
  steps: ReadonlyArray<ScheduledStep> | null;
  targetTime: Date | null;
  ovenMaxC: number | '';
  ballCount: number | '';
  ballWeightG: number | '';
  pathwayName: string;
  onEdit: (section: SummarySection) => void;
}

function dayLabel(date: Date, now: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const chip =
  'min-h-11 rounded-full border border-line bg-surface px-4 py-2 text-left text-sm text-ink hover:bg-surface-2';

export default function ScheduleSummary({
  steps,
  targetTime,
  ovenMaxC,
  ballCount,
  ballWeightG,
  pathwayName,
  onEdit,
}: ScheduleSummaryProps) {
  const { unit } = usePrefs();

  if (!steps || steps.length === 0 || !targetTime) {
    return (
      <section aria-label="Schedule summary" className="rounded-2xl border border-dashed border-line p-5">
        <p className="text-base text-muted">Fill in the details and your start time will appear here.</p>
      </section>
    );
  }

  const now = new Date();
  const start = steps[0].clockStartTime;
  const overnight = steps.some(isOvernight);
  const oven =
    ovenMaxC === '' ? '' : unit === 'C' ? `${Math.round(ovenMaxC)} °C` : `${Math.round((ovenMaxC * 9) / 5 + 32)} °F`;

  return (
    <section aria-label="Schedule summary" className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm font-medium text-muted">Start at</p>
      <p className="mt-1 font-display text-5xl font-extrabold leading-none tracking-tight text-sun">
        {formatClockTime(start)}
      </p>
      <p className="mt-2 text-base text-ink">
        {dayLabel(start, now)} · ready{' '}
        {targetTime.toDateString() === now.toDateString() ? '' : `${dayLabel(targetTime, now)} `}at{' '}
        {formatClockTime(targetTime)}
      </p>
      {overnight && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-accent">
          <span aria-hidden="true">☾</span> Includes an overnight step
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onEdit('when')} className={chip} aria-label="Change ready time">
          <span className="text-muted">Ready </span>
          {formatClockTime(targetTime)}
        </button>
        <button type="button" onClick={() => onEdit('oven')} className={chip} aria-label="Change oven">
          <span className="text-muted">Oven </span>
          {oven}
        </button>
        <button type="button" onClick={() => onEdit('dough')} className={chip} aria-label="Change dough">
          {ballCount} × {ballWeightG} g · {pathwayName}
        </button>
      </div>
    </section>
  );
}
