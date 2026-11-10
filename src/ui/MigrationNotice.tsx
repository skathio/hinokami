// Dismissible, never-blocking banner for `migrationNotice` (Phase 3's two-axis persistence
// check, surfaced here per FR-13/NFR-3). Renders whatever string `engine/persistence.ts`'s
// `migrate()` produced verbatim — this component authors no copy of its own (see
// `phases/04-ui-and-wake-lock.md`'s "Migration notice" section). Reads the store directly rather
// than taking props: it's mounted once at the top of `App.tsx`, above whichever screen is
// active, since a migration notice can fire regardless of which screen the user lands on.

import { useSessionStore } from '@/store/session';

export default function MigrationNotice() {
  const message = useSessionStore((state) => state.migrationNotice);
  const dismiss = useSessionStore((state) => state.dismissMigrationNotice);

  if (!message) return null;

  return (
    <div
      role="status"
      className="flex items-start justify-between gap-4 border-b border-line bg-surface px-4 py-3 text-sm text-ink"
    >
      <p>{message}</p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notice"
        className="min-h-11 min-w-11 shrink-0 rounded-md px-3 text-muted hover:text-ink"
      >
        Dismiss
      </button>
    </div>
  );
}
