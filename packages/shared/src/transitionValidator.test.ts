import { describe, it, expect } from "vitest";
import {
  assertValidMarksTransition,
  assertValidGradesheetTransition,
  InvalidTransitionError,
  type MarksStatus,
  type GradesheetStatus,
} from "./transitionValidator.js";

describe("assertValidMarksTransition", () => {
  const ok: [MarksStatus, MarksStatus][] = [
    ["draft",     "submitted"],
    ["submitted", "approved"],
    ["approved",  "locked"],
    ["locked",    "approved"], // unlock
  ];
  it.each(ok)("%s -> %s is allowed", (a, b) => {
    expect(() => assertValidMarksTransition(a, b)).not.toThrow();
  });

  const bad: [MarksStatus, MarksStatus][] = [
    ["draft",     "approved"],   // skip submitted
    ["draft",     "locked"],     // skip submitted + approved
    ["submitted", "locked"],     // skip approved
    ["approved",  "submitted"],  // backward skip
    ["locked",    "submitted"],  // backward skip
    ["locked",    "draft"],      // backward double skip
    ["approved",  "draft"],      // backward skip
    ["draft",     "draft"],      // self
    ["submitted", "submitted"],  // self
  ];
  it.each(bad)("%s -> %s throws InvalidTransitionError", (a, b) => {
    expect(() => assertValidMarksTransition(a, b)).toThrow(InvalidTransitionError);
  });

  it("InvalidTransitionError carries from/to for diagnostics", () => {
    try {
      assertValidMarksTransition("locked", "draft");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect((e as InvalidTransitionError).code).toBe("invalid_state_transition");
      expect((e as InvalidTransitionError).from).toBe("locked");
      expect((e as InvalidTransitionError).to).toBe("draft");
      return;
    }
    throw new Error("expected throw");
  });
});

describe("assertValidGradesheetTransition", () => {
  const ok: [GradesheetStatus, GradesheetStatus][] = [
    ["draft",     "compiled"],
    ["compiled",  "locked"],
    ["locked",    "published"],
    ["published", "compiled"], // unlock
  ];
  it.each(ok)("%s -> %s is allowed", (a, b) => {
    expect(() => assertValidGradesheetTransition(a, b)).not.toThrow();
  });

  const bad: [GradesheetStatus, GradesheetStatus][] = [
    ["draft",     "locked"],
    ["draft",     "published"],
    ["compiled",  "published"],
    ["published", "locked"],     // backward via publish
    ["published", "draft"],
    ["locked",    "draft"],
    ["locked",    "compiled"],   // backward skip (use unlock path)
  ];
  it.each(bad)("%s -> %s throws InvalidTransitionError", (a, b) => {
    expect(() => assertValidGradesheetTransition(a, b)).toThrow(InvalidTransitionError);
  });
});
