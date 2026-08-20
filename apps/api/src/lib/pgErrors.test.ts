import { describe, it, expect } from "vitest";
import { mapPgError } from "./pgErrors.js";

describe("mapPgError", () => {
  it("maps 23503 on DELETE to 409 has_dependents", () => {
    const { status, body } = mapPgError(
      { code: "23503", message: "violates foreign key constraint" },
      { hasDependents: true },
    );
    expect(status).toBe(409);
    expect(body.error).toBe("has_dependents");
    expect(body.detail).toContain("foreign key");
  });
  it("maps 23503 on INSERT to 409 invalid_reference", () => {
    const { status, body } = mapPgError({ code: "23503", message: "violates foreign key constraint" });
    expect(status).toBe(409);
    expect(body.error).toBe("invalid_reference");
  });
  it("maps 23505 to 409 duplicate", () => {
    const { status, body } = mapPgError({ code: "23505", message: "duplicate key" });
    expect(status).toBe(409);
    expect(body.error).toBe("duplicate");
  });
  it("maps 23514 to 409 invalid_reference (trigger CHECK violations)", () => {
    const { status, body } = mapPgError({ code: "23514", message: "user has wrong role" });
    expect(status).toBe(409);
    expect(body.error).toBe("invalid_reference");
  });
  it("maps PGRST116 to 404 not_found", () => {
    const { status, body } = mapPgError({ code: "PGRST116", message: "row not found" });
    expect(status).toBe(404);
    expect(body.error).toBe("not_found");
  });
  it("maps unknown errors to 500", () => {
    const { status, body } = mapPgError({ code: "XX999", message: "weird" });
    expect(status).toBe(500);
    expect(body.error).toBe("internal_error");
  });
  it("returns 500 for null input", () => {
    const { status, body } = mapPgError(null);
    expect(status).toBe(500);
    expect(body.error).toBe("internal_error");
  });
});
