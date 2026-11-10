import { describe, expect, it } from 'vitest';
import type { ScheduledStep } from '@/engine';
import { isOvernight } from '../stepTime';

const step = (start: Date, durationMinutes: number): ScheduledStep => ({
  stageId: 's',
  name: 'S',
  why: '',
  durationMinutes,
  clockStartTime: start,
  isEstimate: false,
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
