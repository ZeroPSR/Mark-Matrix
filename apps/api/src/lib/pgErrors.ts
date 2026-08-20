export interface MappedPgError {
  status: number;
  body: { error: string; detail?: string };
}

export function mapPgError(
  err: { code?: string; message?: string } | null,
  ctx: { hasDependents?: boolean } = {},
): MappedPgError {
  const code = err?.code ?? "";
  const message = err?.message ?? "unknown error";
  if (code === "23503") {
    if (ctx.hasDependents) {
      return { status: 409, body: { error: "has_dependents", detail: message } };
    }
    return { status: 409, body: { error: "invalid_reference", detail: message } };
  }
  if (code === "23505") {
    return { status: 409, body: { error: "duplicate", detail: message } };
  }
  if (code === "23514") {
    return { status: 409, body: { error: "invalid_reference", detail: message } };
  }
  if (code === "PGRST116") {
    return { status: 404, body: { error: "not_found" } };
  }
  return { status: 500, body: { error: "internal_error", detail: message } };
}
