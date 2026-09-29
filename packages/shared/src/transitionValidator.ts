// Placeholder for Task 3 — Task 3 of cycle-6 will replace this body with the
// real pure transition validator (allowed-state graph + InvalidTransitionError).
// This file exists now only so that `export * from "./transitionValidator.js"`
// in index.ts typechecks before Task 3 lands. No consumer imports it yet, so
// this stub has no runtime effect.
//
// DO NOT use these stubs from anywhere — Task 3 will overwrite them.

import type { MarksStatus } from "./marks.js";
import type { GradesheetStatus } from "./results.js";

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

export function assertValidMarksTransition(
  _from: MarksStatus,
  _to: MarksStatus,
): void {
  // Task 3 replaces this with the real allowed-state graph.
  throw new InvalidTransitionError("placeholder", "placeholder");
}

export function assertValidGradesheetTransition(
  _from: GradesheetStatus,
  _to: GradesheetStatus,
): void {
  // Task 3 replaces this with the real allowed-state graph.
  throw new InvalidTransitionError("placeholder", "placeholder");
}