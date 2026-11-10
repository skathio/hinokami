// `virtual:pwa-register/react` only resolves via `vite-plugin-pwa`'s plugin hooks — mocked here
// (same pattern `StepRunnerScreen.test.tsx` uses for `@/hooks/useWakeLock`) so this test exercises
// `UpdatePrompt`'s own rendering/click-handling logic against a controlled `needRefresh`/
// `updateServiceWorker` signal, rather than depending on whatever the real service-worker
// registration happens to do under jsdom (untestable in this environment — no real SW lifecycle).
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const updateServiceWorker = vi.fn();
const useRegisterSW = vi.fn();

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (...args: unknown[]) => useRegisterSW(...args),
}));

import UpdatePrompt from '../UpdatePrompt';

function mockNeedRefresh(needRefresh: boolean): void {
  useRegisterSW.mockReturnValue({
    needRefresh: [needRefresh, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker,
  });
}

describe('UpdatePrompt', () => {
  it('renders nothing when no update is waiting', () => {
    mockNeedRefresh(false);
    render(<UpdatePrompt />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the reload banner when the SW reports an update is waiting', () => {
    mockNeedRefresh(true);
    render(<UpdatePrompt />);
    expect(screen.getByText(/hinokami has been updated/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('calls updateServiceWorker(true) — skip-waiting + reload — when Reload is clicked', () => {
    mockNeedRefresh(true);
    render(<UpdatePrompt />);
    fireEvent.click(screen.getByRole('button', { name: /reload/i }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
