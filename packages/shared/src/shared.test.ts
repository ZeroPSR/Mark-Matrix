import { describe, it, expect } from "vitest";
import { ROLES, isRole, API_ROUTES } from "./index.js";

describe("@mark-matrix/shared", () => {
  it("exposes the three canonical roles", () => {
    expect(ROLES).toEqual(["admin", "faculty", "student"]);
  });

  it("isRole narrows unknown values correctly", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("guest")).toBe(false);
    expect(isRole(null)).toBe(false);
  });

  it("exposes the health route constant", () => {
    expect(API_ROUTES.health).toBe("/health");
  });
});
