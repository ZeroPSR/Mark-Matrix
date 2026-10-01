import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditAction =
  | "create" | "update" | "delete"
  | "submit" | "approve" | "lock" | "unlock"
  | "compile" | "publish";

export type AuditEntity =
  | "attendance"
  | "marks"
  | "gradesheet"
  | "enrollment"
  | "faculty_assignment"
  | "user"
  | "grade_scheme";

export interface AuditParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  oldValue?: unknown | null;
  newValue?: unknown | null;
}

export async function recordAudit(
  supabase: SupabaseClient,
  params: AuditParams,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("audit_log_write", {
      p_action: params.action,
      p_entity: params.entity,
      p_entity_id: params.entityId,
      p_old_value: params.oldValue ?? null,
      p_new_value: params.newValue ?? null,
    });
    if (error) throw error;
  } catch (err) {
    // Best-effort: never throw to the caller. Surface to ops via stderr so
    // cycle-8c's Cloudflare Workers log hook can pick it up.
    // Supabase returns errors as plain { message, code } objects (not Error
    // instances), so extract .message from either shape.
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err);
    console.error("[audit_log] insert failed", {
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId,
      error: message,
    });
  }
}
