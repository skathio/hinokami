// Small time helpers for the cook view: clock formatting and the overnight flag. Pure functions
// so they are tested without rendering.

import type { ScheduledStep } from '@/engine';

const MINUTE_MS = 60_000;
/** A step is "overnight" when it spans a local midnight and runs at least this long, so a short
 * step that merely starts at 23:50 is not flagged. */
const OVERNIGHT_MIN_MINUTES = 240;
/** A step that starts between midnight and this hour needs someone awake in the small hours, so
 * it is flagged whatever its length (backward scheduling can put a 15-minute mix at 03:14). */
const SMALL_HOURS_END = 6;

export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function isOvernight(step: ScheduledStep): boolean {
  if (step.clockStartTime.getHours() < SMALL_HOURS_END) return true;
  if (step.durationMinutes < OVERNIGHT_MIN_MINUTES) return false;
  const end = new Date(step.clockStartTime.getTime() + step.durationMinutes * MINUTE_MS);
  return end.toDateString() !== step.clockStartTime.toDateString();
}
