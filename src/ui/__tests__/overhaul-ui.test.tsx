// Behaviour added by the UI overhaul: progress rail semantics, footer countdown, theme toggle,
// and the schedule summary on the config screen.
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import StepRunnerScreen from '../StepRunnerScreen';
import ThemeToggle from '../ThemeToggle';
import ScheduleSummary from '../ScheduleSummary';
import { useSessionStore } from '@/store/session';
import { PREFS_STORAGE_KEY, reloadPrefs } from '@/prefs/prefs';
import type { BakeSession, ScheduledStep } from '@/engine';

function step(stageId: string, name: string, start: Date, durationMinutes = 30): ScheduledStep {
  return { stageId, name, why: `${name} why`, durationMinutes, clockStartTime: start, isEstimate: false };
}

function session(stepIndex: number, workflow: ScheduledStep[]): BakeSession {
  return {
    schemaVersion: 1,
    sessionKey: 'k',
    recipeId: 'pizza',
    recipeContentVersion: '1',
    inputs: {
      targetTime: new Date().toISOString(),
      ovenMaxC: 250,
      hasStoneOrSteel: false,
      ambientC: 22,
      ballCount: 4,
      ballWeightG: 250,
      pathway: 'same-day',
    },
    workflow,
    stepIndex,
    status: 'in-progress',
  } as unknown as BakeSession;
}

beforeEach(() => {
  localStorage.clear();
  reloadPrefs();
});

describe('StepRunnerScreen progress rail', () => {
  const now = Date.now();
  const flow = [
    step('a', 'Mix', new Date(now - 3_600_000)),
    step('b', 'Rest', new Date(now + 2 * 3_600_000 + 15 * 60_000 - 30_000)),
    step('c', 'Bake', new Date(now + 5 * 3_600_000)),
  ];

  it('marks exactly the current step with aria-current and labels done/upcoming states', () => {
    useSessionStore.setState({ session: session(1, flow), view: 'runner' });
    render(<StepRunnerScreen />);
    const rail = screen.getByRole('list', { name: 'Progress' });
    const items = within(rail).getAllByRole('listitem');
    expect(items.map((li) => li.getAttribute('aria-current'))).toEqual([null, 'step', null]);
    expect(items[0]).toHaveTextContent('Mix, done');
    expect(items[1]).toHaveTextContent('Rest, current');
    expect(items[2]).toHaveTextContent('Bake, upcoming');
  });

  it('keeps the step countdown in the sticky footer, next to the primary action', () => {
    useSessionStore.setState({ session: session(1, flow), view: 'runner' });
    render(<StepRunnerScreen />);
    const countdown = screen.getByText(/m left/);
    const done = screen.getByRole('button', { name: 'Next' });
    expect(countdown.closest('.sticky')).not.toBeNull();
    expect(countdown.closest('.sticky')).toBe(done.closest('.sticky'));
  });

  it('flags an overnight step', () => {
    const night = [step('a', 'Cold ferment', new Date(2026, 0, 1, 21, 0), 18 * 60), step('b', 'Bake', new Date(2026, 0, 2, 15, 0))];
    useSessionStore.setState({ session: session(0, night), view: 'runner' });
    render(<StepRunnerScreen />);
    expect(screen.getByText(/overnight step/i)).toBeInTheDocument();
  });
});

describe('ThemeToggle', () => {
  it('stores the override under the prefs key, not the session key', () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem(PREFS_STORAGE_KEY)).toContain('"dark"');
    expect(localStorage.getItem('hinokami-session-v1')).toBeNull();
  });
});

describe('ScheduleSummary', () => {
  const steps = [step('a', 'Mix', new Date(2026, 5, 1, 9, 5))];
  const base = { ovenMaxC: 250 as const, ballCount: 4 as const, ballWeightG: 250 as const, pathwayName: 'Same-day' };

  it('prompts until a schedule exists', () => {
    render(<ScheduleSummary steps={null} targetTime={null} {...base} onEdit={() => {}} />);
    expect(screen.getByText(/start time will appear/i)).toBeInTheDocument();
  });

  it('leads with the start time and lets a single setting be edited', () => {
    const edits: string[] = [];
    render(<ScheduleSummary steps={steps} targetTime={new Date(2026, 5, 1, 19, 0)} {...base} onEdit={(s) => edits.push(s)} />);
    expect(screen.getByText('Start at')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change oven' }));
    fireEvent.click(screen.getByRole('button', { name: 'Change dough' }));
    expect(edits).toEqual(['oven', 'dough']);
  });
});
