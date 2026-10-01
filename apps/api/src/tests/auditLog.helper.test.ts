import { describe, it, expect, vi } from "vitest";
import { recordAudit } from "../lib/auditLog.js";

describe("recordAudit (happy path)", () => {
  it("calls supabase.rpc with audit_log_write and the expected params", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });
    const supabase = { rpc } as never;

    await recordAudit(supabase, {
      action: "update",
      entity: "attendance",
      entityId: "abc-123",
      oldValue: { status: "absent" },
      newValue: { status: "present" },
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("audit_log_write", {
      p_action: "update",
      p_entity: "attendance",
      p_entity_id: "abc-123",
      p_old_value: { status: "absent" },
      p_new_value: { status: "present" },
    });
  });
});

describe("recordAudit (best-effort error handling)", () => {
  it("does not throw when RPC returns an error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "internal error", code: "500" },
    });
    const supabase = { rpc } as never;

    await expect(
      recordAudit(supabase, {
        action: "update",
        entity: "attendance",
        entityId: "abc-123",
        oldValue: null,
        newValue: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when RPC throws synchronously", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network down"));
    const supabase = { rpc } as never;

    await expect(
      recordAudit(supabase, {
        action: "create",
        entity: "enrollment",
        entityId: "x",
      }),
    ).resolves.toBeUndefined();
  });

  it("logs a structured error to console.error on failure", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom", code: "500" },
    });
    const supabase = { rpc } as never;

    await recordAudit(supabase, {
      action: "lock",
      entity: "marks",
      entityId: "course-x",
      oldValue: { status: "approved" },
      newValue: { status: "locked" },
    });

    expect(errSpy).toHaveBeenCalledTimes(1);
    const call = errSpy.mock.calls[0];
    expect(call?.[0]).toBe("[audit_log] insert failed");
    expect(call?.[1]).toEqual({
      action: "lock",
      entity: "marks",
      entity_id: "course-x",
      error: "boom",
    });

    errSpy.mockRestore();
  });
});

describe("recordAudit (null normalization)", () => {
  it("converts undefined oldValue/newValue to JSON null", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const supabase = { rpc } as never;

    await recordAudit(supabase, {
      action: "create",
      entity: "enrollment",
      entityId: "new-id",
      // oldValue and newValue both omitted → should become JSON null
    });

    expect(rpc).toHaveBeenCalledWith("audit_log_write", {
      p_action: "create",
      p_entity: "enrollment",
      p_entity_id: "new-id",
      p_old_value: null,
      p_new_value: null,
    });
  });
});
