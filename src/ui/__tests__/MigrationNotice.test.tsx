// `MigrationNotice` reads/writes the real store directly (no props) — see the component's
// header comment. These tests drive the real `useSessionStore` rather than mocking it, since the
// component has nothing else to connect to.

import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MigrationNotice from '../MigrationNotice';
import { useSessionStore } from '@/store/session';

beforeEach(() => {
  localStorage.clear();
  useSessionStore.setState({ session: null, migrationNotice: null, view: 'recipe-select' });
});

describe('MigrationNotice', () => {
  it('renders nothing when migrationNotice is null', () => {
    render(<MigrationNotice />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the notice text verbatim and dismisses it on click', () => {
    const message =
      "This recipe was updated after you started this bake — you're continuing on your original schedule.";
    useSessionStore.setState({ migrationNotice: message });

    render(<MigrationNotice />);

    expect(screen.getByRole('status')).toHaveTextContent(message);

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(useSessionStore.getState().migrationNotice).toBeNull();
  });
});
