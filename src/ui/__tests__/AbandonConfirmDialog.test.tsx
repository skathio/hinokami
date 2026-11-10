// RTL tests for the abandon/reset confirmation modal (FR-16, FR-20). Store mocked the same way
// `NudgePanel.test.tsx`/`StepRunnerScreen.test.tsx` do — a static fake `SessionStore` state,
// spied onto the module namespace — since the dialog calls `store.resetSession()` directly on
// confirm (matching the phase spec literally).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AbandonConfirmDialog from '../AbandonConfirmDialog';
import * as sessionStoreModule from '@/store/session';
import { useSessionStore, type SessionStore } from '@/store/session';

function mockStore(overrides: Partial<SessionStore> = {}): SessionStore {
  const state: SessionStore = {
    session: null,
    migrationNotice: null,
    view: 'runner',
    lastNudgeClamped: false,
    scaledIngredients: null,
    startSession: vi.fn(),
    advanceStep: vi.fn(),
    backStep: vi.fn(),
    applyNudge: vi.fn(),
    resetSession: vi.fn(),
    dismissMigrationNotice: vi.fn(),
    setView: vi.fn(),
    syncViewAfterHydration: vi.fn(),
    recomputeScaledIngredients: vi.fn(),
    ...overrides,
  };
  vi.spyOn(sessionStoreModule, 'useSessionStore').mockImplementation(
    ((selector: (s: SessionStore) => unknown) => selector(state)) as typeof useSessionStore,
  );
  return state;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AbandonConfirmDialog (FR-16, FR-20)', () => {
  it('renders the confirmation copy', () => {
    mockStore();
    render(<AbandonConfirmDialog onCancel={vi.fn()} />);

    expect(screen.getByText(/abandon this bake and start fresh/i)).toBeInTheDocument();
    expect(screen.getByText(/this can.t be undone/i)).toBeInTheDocument();
  });

  it('confirm calls store.resetSession', () => {
    const state = mockStore();
    render(<AbandonConfirmDialog onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /abandon bake/i }));

    expect(state.resetSession).toHaveBeenCalledTimes(1);
  });

  it('cancel calls onCancel and does not call resetSession', () => {
    const state = mockStore();
    const onCancel = vi.fn();
    render(<AbandonConfirmDialog onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(state.resetSession).not.toHaveBeenCalled();
  });

  describe('focus management (NFR-11, review Minor)', () => {
    it('moves focus into the dialog on mount', () => {
      mockStore();
      render(<AbandonConfirmDialog onCancel={vi.fn()} />);

      expect(screen.getByRole('button', { name: /^cancel$/i })).toHaveFocus();
    });

    it('Escape calls onCancel, the same as clicking Cancel', () => {
      mockStore();
      const onCancel = vi.fn();
      render(<AbandonConfirmDialog onCancel={onCancel} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });
});
