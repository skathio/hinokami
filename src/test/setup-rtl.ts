// Wires `@testing-library/jest-dom`'s matchers (toBeInTheDocument, etc.) into Vitest's `expect`,
// and registers RTL's `cleanup()` after every test. Neither happens automatically here: this
// repo doesn't enable Vitest's `test.globals` (see `vite.config.ts`), which is the only mode
// under which `@testing-library/react`'s own auto-cleanup can detect a global `afterEach` to
// hook into. Phase 4 is the first iteration with RTL component tests — registered once via
// `vite.config.ts`'s `test.setupFiles`, same pattern as `setup-jsdom-local-storage.ts`.

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
