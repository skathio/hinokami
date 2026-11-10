import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AppErrorBoundary from '../AppErrorBoundary';
import { useSessionStore } from '@/store/session';

function Boom(): never {
  throw new Error('render failed');
}

afterEach(() => {
  vi.restoreAllMocks();
  useSessionStore.setState({ session: null, view: 'recipe-select' });
});

describe('AppErrorBoundary', () => {
  it('shows a recovery screen instead of a blank page when rendering throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.t be opened/i);
    expect(screen.getByRole('button', { name: 'Start a new bake' })).toBeInTheDocument();
  });

  it('drops the saved bake and renders the app again on "Start a new bake"', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const resetSpy = vi.spyOn(useSessionStore.getState(), 'resetSession');
    let shouldThrow = true;
    function MaybeBoom() {
      if (shouldThrow) throw new Error('render failed');
      return <p>app is back</p>;
    }
    render(
      <AppErrorBoundary>
        <MaybeBoom />
      </AppErrorBoundary>,
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Start a new bake' }));
    expect(resetSpy).toHaveBeenCalledOnce();
    expect(screen.getByText('app is back')).toBeInTheDocument();
  });
});
