// Abandon/reset confirmation (FR-16, FR-20). A destructive action — clearing the active session
// entirely — always gated behind an explicit confirmation, never a single tap. Calls
// `store.resetSession()` directly on confirm (matching the phase spec literally, and the
// convention already used by `MigrationNotice`/`ConfigScreen` — this codebase's read-heavy
// components subscribe to the store themselves rather than taking every action as a prop). Only
// "Cancel" is a caller-supplied callback, since closing the dialog without resetting anything is
// pure local UI state the caller (`StepRunnerScreen`) owns.
//
// Focus management (NFR-11, review Minor): `useModalFocus` moves focus in on mount, closes on
// Escape (same as Cancel), and traps Tab within the dialog.

import { useSessionStore } from '@/store/session';
import { useModalFocus } from '@/hooks/useModalFocus';

export interface AbandonConfirmDialogProps {
  onCancel: () => void;
}

export default function AbandonConfirmDialog({ onCancel }: AbandonConfirmDialogProps) {
  const resetSession = useSessionStore((state) => state.resetSession);
  const containerRef = useModalFocus<HTMLDivElement>(onCancel);

  return (
    <div
      ref={containerRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="abandon-dialog-title"
      tabIndex={-1}
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-6"
    >
      <div className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 p-5 text-zinc-100">
        <h2 id="abandon-dialog-title" className="text-lg font-semibold">
          Abandon this bake and start fresh?
        </h2>
        <p className="mt-1 text-sm text-zinc-400">This can&apos;t be undone.</p>
        <div className="mt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 rounded-md border border-zinc-600 px-4 py-2 font-medium text-zinc-100 hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={resetSession}
            className="min-h-11 rounded-md bg-red-700 px-4 py-2 font-medium text-white hover:bg-red-600"
          >
            Abandon bake
          </button>
        </div>
      </div>
    </div>
  );
}
