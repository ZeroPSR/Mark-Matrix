import type { MarksStatus } from "./marks.js";
import type { GradesheetStatus } from "./results.js";

// Re-export the status unions so callers (notably the test file in this
// package) can import both the asserters and the status types from a single
// module. The assertion function signatures themselves remain unchanged
// from the Task-2 placeholder, preserving byte-compat with downstream
// consumers in apps/api.
export type { MarksStatus, GradesheetStatus };

export class InvalidTransitionError extends Error {
  readonly code = "invalid_state_transition";
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`invalid state transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

const MARKS_ALLOWED: ReadonlyMap<MarksStatus, ReadonlySet<MarksStatus>> = new Map([
  ["draft",     new Set<MarksStatus>(["submitted"])],
  ["submitted", new Set<MarksStatus>(["approved"])],
  ["approved",  new Set<MarksStatus>(["locked"])],
  ["locked",    new Set<MarksStatus>(["approved"])], // unlock
]);

const GRADESHEET_ALLOWED: ReadonlyMap<GradesheetStatus, ReadonlySet<GradesheetStatus>> = new Map([
  ["draft",     new Set<GradesheetStatus>(["compiled"])],
  ["compiled",  new Set<GradesheetStatus>(["locked"])],
  ["locked",    new Set<GradesheetStatus>(["published"])],
  ["published", new Set<GradesheetStatus>(["compiled"])], // unlock
]);

export function assertValidMarksTransition(from: MarksStatus, to: MarksStatus): void {
  const allowed = MARKS_ALLOWED.get(from);
  if (!allowed || !allowed.has(to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function assertValidGradesheetTransition(
  from: GradesheetStatus,
  to: GradesheetStatus,
): void {
  const allowed = GRADESHEET_ALLOWED.get(from);
  if (!allowed || !allowed.has(to)) {
    throw new InvalidTransitionError(from, to);
  }
}
