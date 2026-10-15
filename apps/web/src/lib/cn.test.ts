import { describe, it, expect } from "vitest";
import { cn } from "./cn.js";

describe("cn", () => {
  it("joins truthy strings with space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });
  it("drops falsy values", () => {
    expect(cn("a", undefined, null, false, "b")).toBe("a b");
  });
  it("returns empty string when all falsy", () => {
    expect(cn(undefined, null, false)).toBe("");
  });
  it("keeps inner spaces within an argument", () => {
    expect(cn("a b", "c")).toBe("a b c");
  });
});