import { describe, expect, it } from 'vitest';
import type { ScheduledStep } from '@/engine';
import { formatCountdown, isOvernight } from '../stepTime';

const step = (start: Date, durationMinutes: number): ScheduledStep => ({
  stageId: 's',
  name: 'S',
  why: '',
  durationMinutes,
  clockStartTime: start,
  isEstimate: false,
});

describe('formatCountdown', () => {
  const now = new Date(2026, 0, 1, 12, 0, 0);
  it('formats hours and minutes', () => {
    expect(formatCountdown(new Date(2026, 0, 1, 14, 15), now)).toBe('in 2 h 15 m');
  });
  it('omits zero parts', () => {
    expect(formatCountdown(new Date(2026, 0, 1, 12, 45), now)).toBe('in 45 m');
    expect(formatCountdown(new Date(2026, 0, 1, 15, 0), now)).toBe('in 3 h');
  });
  it('rounds partial minutes up and reports due now at or past the time', () => {
    expect(formatCountdown(new Date(2026, 0, 1, 12, 0, 20), now)).toBe('in 1 m');
    expect(formatCountdown(now, now)).toBe('due now');
    expect(formatCountdown(new Date(2026, 0, 1, 11, 0), now)).toBe('due now');
  });
});

describe('isOvernight', () => {
  it('flags a long step that crosses midnight', () => {
    expect(isOvernight(step(new Date(2026, 0, 1, 21, 0), 18 * 60))).toBe(true);
  });
  it('flags any step that starts in the small hours, however short', () => {
    expect(isOvernight(step(new Date(2026, 0, 2, 3, 14), 15))).toBe(true);
    expect(isOvernight(step(new Date(2026, 0, 2, 0, 0), 10))).toBe(true);
    expect(isOvernight(step(new Date(2026, 0, 2, 6, 0), 15))).toBe(false);
  });
  it('does not flag a long daytime step or a short step near midnight', () => {
    expect(isOvernight(step(new Date(2026, 0, 1, 8, 0), 6 * 60))).toBe(false);
    expect(isOvernight(step(new Date(2026, 0, 1, 23, 50), 30))).toBe(false);
  });
});
