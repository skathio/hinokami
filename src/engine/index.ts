// Public engine surface — what recipes and the UI/store are meant to import from.

export type {
  BakeSession,
  ScaledIngredient,
  ScheduledStep,
  Step,
  TargetTooSoon,
  WorkflowInputs,
  WorkflowResult,
} from './types';

export type { Batch } from './scaling';
export { scaleFormula } from './scaling';

export { reschedule, solveScheduleBackward } from './schedule';

export type { GenerateWorkflowResult } from './workflow';
export { generateWorkflow } from './workflow';

export { advance, applyNudge, back, isStepActive, isTerminal } from './progression';

export type { MigrateResult } from './persistence';
export { migrate, restore, serialize } from './persistence';
