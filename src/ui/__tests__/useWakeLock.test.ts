// Tests for `useWakeLock` (FR-8, NFR-7). `navigator.wakeLock` is stubbed per-test rather than
// relying on a real browser API (jsdom has no Screen Wake Lock implementation at all, which
// conveniently also gives the "unavailable" path a real, not-mocked-away test case for free).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useWakeLock } from '@/hooks/useWakeLock';

interface FakeSentinel {
  release: ReturnType<typeof vi.fn>;
  released: boolean;
}

function buildFakeSentinel(): FakeSentinel {
  const sentinel: FakeSentinel = {
    released: false,
    release: vi.fn(),
  };
  sentinel.release.mockImplementation(() => {
    sentinel.released = true;
    return Promise.resolve();
  });
  return sentinel;
}

function stubWakeLock(requestImpl: (type: string) => Promise<FakeSentinel>): void {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: { request: vi.fn(requestImpl) },
  });
}

function removeWakeLockStub(): void {
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: undefined,
  });
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  removeWakeLockStub();
  setVisibility('visible');
  vi.restoreAllMocks();
});

describe('useWakeLock — acquisition (FR-8)', () => {
  it('acquires a screen wake lock when isStepActive is true', async () => {
    const sentinel = buildFakeSentinel();
    const request = vi.fn().mockResolvedValue(sentinel);
    stubWakeLock(request);

    const { result } = renderHook(() => useWakeLock(true));

    await waitFor(() => expect(result.current.wakeLockUnavailable).toBe(false));
    expect(request).toHaveBeenCalledWith('screen');
  });

  it('does not attempt acquisition when isStepActive is false', async () => {
    const sentinel = buildFakeSentinel();
    const request = vi.fn().mockResolvedValue(sentinel);
    stubWakeLock(request);

    renderHook(() => useWakeLock(false));

    // Give any stray microtask a chance to run, then assert nothing fired.
    await Promise.resolve();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('useWakeLock — visibility handling (FR-8)', () => {
  it('releases the held sentinel when the tab becomes hidden', async () => {
    const sentinel = buildFakeSentinel();
    stubWakeLock(() => Promise.resolve(sentinel));

    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(sentinel.release).not.toHaveBeenCalled()); // sanity: not yet

    act(() => setVisibility('hidden'));

    await waitFor(() => expect(sentinel.release).toHaveBeenCalledTimes(1));
  });

  it('re-acquires when the tab becomes visible again while still active', async () => {
    const firstSentinel = buildFakeSentinel();
    const secondSentinel = buildFakeSentinel();
    const request = vi.fn().mockResolvedValueOnce(firstSentinel).mockResolvedValueOnce(secondSentinel);
    stubWakeLock(request);

    renderHook(() => useWakeLock(true));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

    act(() => setVisibility('hidden'));
    await waitFor(() => expect(firstSentinel.release).toHaveBeenCalledTimes(1));

    act(() => setVisibility('visible'));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });
});

describe('useWakeLock — graceful degradation (NFR-7)', () => {
  it('sets wakeLockUnavailable when navigator.wakeLock is absent, without throwing', async () => {
    removeWakeLockStub();

    const { result } = renderHook(() => useWakeLock(true));

    await waitFor(() => expect(result.current.wakeLockUnavailable).toBe(true));
  });

  it('sets wakeLockUnavailable when the browser denies the request, without throwing', async () => {
    stubWakeLock(() => Promise.reject(new Error('Permission denied')));

    const { result } = renderHook(() => useWakeLock(true));

    await waitFor(() => expect(result.current.wakeLockUnavailable).toBe(true));
  });
});
