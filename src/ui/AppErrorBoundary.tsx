// Last-resort recovery screen. A render crash would otherwise leave a blank page on every launch,
// because the saved bake that caused it is restored again each time. "Start a new bake" drops that
// saved bake and returns to recipe selection, so the user is never stuck without clearing site data.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useSessionStore } from '@/store/session';
import Wordmark from './Wordmark';

interface State {
  failed: boolean;
}

export default class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV) console.error('[hinokami] render failed', error, info.componentStack);
  }

  private startOver = (): void => {
    useSessionStore.getState().resetSession();
    this.setState({ failed: false });
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main
        role="alert"
        className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas p-6 text-center text-ink"
      >
        <Wordmark className="text-3xl" />
        <h1 className="font-display text-3xl font-bold">Your saved bake couldn&apos;t be opened</h1>
        <p className="max-w-sm text-lg text-muted">
          Something in it is damaged. Start a new bake to continue; your settings for theme and units are kept.
        </p>
        <button
          type="button"
          onClick={this.startOver}
          className="min-h-14 rounded-xl bg-ember px-8 py-3 text-xl font-bold text-on-ember hover:brightness-90"
        >
          Start a new bake
        </button>
      </main>
    );
  }
}
