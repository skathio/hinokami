// The one-step-at-a-time progression state machine (FR-7). Owns the step index + the
// `isStepActive` signal; *triggers* the schedule solver's `reschedule` for a pace nudge but
// never computes the nudge math itself (D14).

import type { Recipe } from '@/recipes/contract';
import { reschedule } from './schedule';
import type { BakeSession } from './types';

/** Advances to the next step. Calling this on the last step marks the session `completed`
 * rather than stepping past the end of `workflow` (FR-7: "advance on done"). */
export function advance(session: BakeSession): BakeSession {
  const lastIndex = session.workflow.length - 1;
  if (session.stepIndex >= lastIndex) {
    return { ...session, status: 'completed' };
  }
  return { ...session, stepIndex: session.stepIndex + 1 };
}

/** Steps back one, clamped at the first step. Stepping back out of a `completed` session
 * resumes it as `in-progress` (FR-7: "allow back"). */
export function back(session: BakeSession): BakeSession {
  if (session.stepIndex <= 0) return session;
  return { ...session, stepIndex: session.stepIndex - 1, status: 'in-progress' };
}

/** True while the current step is the one the baker is actively working (drives wake-lock —
 * FR-8, Phase 4). */
export function isStepActive(session: BakeSession): boolean {
  return session.status === 'in-progress';
}

/** True once the baker has stepped through and completed the final step. */
export function isTerminal(session: BakeSession): boolean {
  return session.stepIndex >= session.workflow.length - 1 && session.status === 'completed';
}

/**
 * Bounded pace-nudge (D14, FR-17). Triggers — never computes — the schedule solver's
 * `reschedule` for every step from `stepIndex` onward. Validates the session belongs to the
 * given `recipe` first (fail loud rather than silently rescheduling against the wrong recipe's
 * session — `sdd.md §6`).
 */
export function applyNudge(session: BakeSession, deltaMinutes: number, recipe: Recipe): BakeSession {
  if (session.recipeId !== recipe.id) {
    throw new Error(
      `applyNudge: session belongs to recipe "${session.recipeId}", not "${recipe.id}"`,
    );
  }
  const remaining = session.workflow.slice(session.stepIndex);
  const rescheduledRemaining = reschedule(remaining, deltaMinutes);
  const workflow = [...session.workflow.slice(0, session.stepIndex), ...rescheduledRemaining];
  return { ...session, workflow };
}
