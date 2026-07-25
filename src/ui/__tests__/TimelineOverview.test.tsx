// RTL tests for the read-only timeline overview (FR-18). New in iteration 3.2 alongside the
// duration + target-marker functional addition (plan review F-5, `phases/03-visual-layer.md`
// iteration 3.2) — previously untested since the component only rendered step name + clock time,
// with no computed content worth asserting on. `TimelineOverview` is purely props-driven (no
// store dependency), so no store mock is needed here — unlike `RecipeCard`/`AbandonConfirmDialog`.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TimelineOverview from '../TimelineOverview';
import type { ScheduledStep } from '@/engine';

function buildStep(overrides: Partial<ScheduledStep> = {}): ScheduledStep {
  return {
    stageId: 'mix',
    name: 'Mix',
    why: 'Mixing hydrates the flour and starts gluten development.',
    durationMinutes: 15,
    clockStartTime: new Date('2026-07-19T10:00:00'),
    isEstimate: false,
    ...overrides,
  };
}

// A chronologically consistent multi-step fixture: each step's clockStartTime + durationMinutes
// equals the next step's clockStartTime, and the last step's end is the schedule's target time —
// the same invariant `reschedule`/`solveScheduleBackward` maintain in the real engine
// (`engine/schedule.ts:258-259`).
const MULTI_STEP_WORKFLOW: ReadonlyArray<ScheduledStep> = [
  buildStep({
    stageId: 'mix',
    name: 'Mix',
    clockStartTime: new Date('2026-07-19T10:00:00'),
    durationMinutes: 15,
  }),
  buildStep({
    stageId: 'bulk',
    name: 'Bulk ferment',
    clockStartTime: new Date('2026-07-19T10:15:00'),
    durationMinutes: 240,
    isEstimate: true,
  }),
  buildStep({
    stageId: 'bake',
    name: 'Bake',
    clockStartTime: new Date('2026-07-19T14:15:00'),
    durationMinutes: 12,
  }),
];

describe('TimelineOverview — durations (plan review F-5)', () => {
  it("renders each step's duration alongside its clock time", () => {
    render(<TimelineOverview steps={MULTI_STEP_WORKFLOW} currentStepIndex={0} onClose={vi.fn()} />);

    expect(screen.getByText(/15 min/)).toBeInTheDocument();
    expect(screen.getByText(/240 min/)).toBeInTheDocument();
    expect(screen.getByText(/12 min/)).toBeInTheDocument();
  });

  it('rounds a fractional durationMinutes to the nearest minute (review F-27/F-28: Q10-scaled fermentation stages — bulk/proof — carry a float duration for any ambient != 24C)', () => {
    const workflowWithFractionalDuration: ReadonlyArray<ScheduledStep> = [
      buildStep({
        stageId: 'bulk',
        name: 'Bulk ferment',
        clockStartTime: new Date('2026-07-19T10:15:00'),
        durationMinutes: 118.756,
        isEstimate: true,
      }),
    ];

    render(
      <TimelineOverview steps={workflowWithFractionalDuration} currentStepIndex={0} onClose={vi.fn()} />,
    );

    expect(screen.getByText(/119 min/)).toBeInTheDocument();
    expect(screen.queryByText(/118\.756/)).not.toBeInTheDocument();
  });
});

describe('TimelineOverview — target marker (plan review F-5)', () => {
  it("shows the overall ready time equal to the last step's clockStartTime + durationMinutes", () => {
    render(<TimelineOverview steps={MULTI_STEP_WORKFLOW} currentStepIndex={0} onClose={vi.fn()} />);

    const lastStep = MULTI_STEP_WORKFLOW[MULTI_STEP_WORKFLOW.length - 1];
    const expectedTarget = new Date(lastStep.clockStartTime.getTime() + lastStep.durationMinutes * 60_000);
    const expectedLabel = expectedTarget.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

    expect(screen.getByText(/ready by/i)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(expectedLabel.replace(/\s/g, '\\s')))).toBeInTheDocument();
  });

  it('renders no target marker for an empty steps array (defensive, no crash)', () => {
    expect(() =>
      render(<TimelineOverview steps={[]} currentStepIndex={0} onClose={vi.fn()} />),
    ).not.toThrow();
    expect(screen.queryByText(/ready by/i)).not.toBeInTheDocument();
  });
});

describe('TimelineOverview — existing behavior (regression)', () => {
  it('renders every step name and highlights the current step', () => {
    render(<TimelineOverview steps={MULTI_STEP_WORKFLOW} currentStepIndex={1} onClose={vi.fn()} />);

    expect(screen.getByText('Mix')).toBeInTheDocument();
    expect(screen.getByText('Bulk ferment')).toBeInTheDocument();
    expect(screen.getByText('Bake')).toBeInTheDocument();
  });

  it('moves focus into the dialog on mount (NFR-11)', () => {
    render(<TimelineOverview steps={MULTI_STEP_WORKFLOW} currentStepIndex={0} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: /^close$/i })).toHaveFocus();
  });

  it('Escape calls onClose, the same as clicking Close', () => {
    const onClose = vi.fn();
    render(<TimelineOverview steps={MULTI_STEP_WORKFLOW} currentStepIndex={0} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clicking Close calls onClose', () => {
    const onClose = vi.fn();
    render(<TimelineOverview steps={MULTI_STEP_WORKFLOW} currentStepIndex={0} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
