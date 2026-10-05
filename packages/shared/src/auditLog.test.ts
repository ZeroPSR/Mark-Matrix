import { describe, it, expect } from "vitest";
import { auditLogListQuerySchema, auditLogRowSchema } from "./auditLog.js";

describe("auditLogListQuerySchema", () => {
  it("accepts an empty query (all defaults)", () => {
    const r = auditLogListQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(1);
      expect(r.data.pageSize).toBe(50);
    }
  });

  it("rejects an unknown entity", () => {
    const r = auditLogListQuerySchema.safeParse({ entity: "nope" });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown action", () => {
    const r = auditLogListQuerySchema.safeParse({ action: "explode" });
    expect(r.success).toBe(false);
  });

  it("clamps pageSize to 200 max", () => {
    const r = auditLogListQuerySchema.safeParse({ pageSize: 999 });
    expect(r.success).toBe(false);
  });

  it("rejects a malformed user_id (non-uuid)", () => {
    const r = auditLogListQuerySchema.safeParse({ userId: "not-a-uuid" });
    expect(r.success).toBe(false);
  });
});

describe("auditLogRowSchema", () => {
  it("parses a complete row", () => {
    const r = auditLogRowSchema.safeParse({
      id: 1,
      created_at: "2026-10-05T10:00:00Z",
      user_id: "11111111-1111-1111-1111-111111111111",
      action: "update",
      entity: "marks",
      entity_id: "m1",
      old_value: { status: "draft" },
      new_value: { status: "approved" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts null old_value and new_value", () => {
    const r = auditLogRowSchema.safeParse({
      id: 1,
      created_at: "2026-10-05T10:00:00Z",
      user_id: "11111111-1111-1111-1111-111111111111",
      action: "create",
      entity: "enrollment",
      entity_id: "e1",
      old_value: null,
      new_value: null,
    });
    expect(r.success).toBe(true);
  });
});
