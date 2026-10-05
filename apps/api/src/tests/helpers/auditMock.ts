import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mock supabase client for audit tests.
 *
 * Captures: every .update(arg), every .eq(col, val), every .rpc(name, args).
 * Returns: configured data from .update().select(...) and a successful rpc result.
 *
 * `tableResponses` lets tests return different data per table (e.g. a
 * semesters row vs the update target). The first matching key wins;
 * fallback to `updateReturns` if no per-table entry matches.
 */
export function makeAuditMockSupabase(opts: {
  updateReturns?: { data: Record<string, unknown>[] | null; error: null | { code: string; message: string }; count?: number | null };
  tableResponses?: Record<string, { data: Record<string, unknown>[] | null; error: null | { code: string; message: string }; count?: number | null }>;
} = {}) {
  const updateReturns = opts.updateReturns ?? {
    data: [{ id: "row-1" }, { id: "row-2" }],
    error: null,
    count: 2,
  };
  const tableResponses = opts.tableResponses ?? {};
  const calls = {
    update: [] as { arg: unknown }[],
    eq: [] as { col: string; val: unknown }[],
    rpc: [] as { name: string; args: Record<string, unknown> }[],
  };

  const builder = (table: string): unknown => {
    const returns = tableResponses[table] ?? updateReturns;
    // Default count = data.length (Supabase returns the row count when
    // { count: "exact" } is set on .select()). Tests can override via
    // `count` on the per-table response.
    const effectiveCount =
      returns.count !== undefined ? returns.count : Array.isArray(returns.data) ? returns.data.length : 0;
    const b: Record<string, unknown> = {
      select() { return b; },
      eq(col: string, val: unknown) { calls.eq.push({ col, val }); return b; },
      neq() { return b; },
      in() { return b; },
      order() { return b; },
      range() { return b; },
      gte() { return b; },
      lte() { return b; },
      update(arg: unknown) { calls.update.push({ arg }); return b; },
      upsert(arg: unknown) { calls.update.push({ arg }); return b; },
      insert(arg: unknown) { calls.update.push({ arg }); return b; },
      delete() { return b; },
      single() {
        const data = returns.data;
        const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
        return Promise.resolve({ data: first, error: returns.error, count: effectiveCount });
      },
      maybeSingle() {
        const data = returns.data;
        const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
        return Promise.resolve({ data: first, error: returns.error, count: effectiveCount });
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return Promise.resolve({ ...returns, count: effectiveCount }).then(onFulfilled, onRejected);
      },
    };
    return b;
  };

  const supabase = {
    from: (t: string) => builder(t),
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.rpc.push({ name, args });
      return Promise.resolve({ data: 1, error: null });
    },
  } as unknown as SupabaseClient;

  return { supabase, calls };
}
