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
  updateReturns?: { data: Record<string, unknown>[] | null; error: null | { code: string; message: string } };
  tableResponses?: Record<string, { data: Record<string, unknown>[] | null; error: null | { code: string; message: string } }>;
} = {}) {
  const updateReturns = opts.updateReturns ?? {
    data: [{ id: "row-1" }, { id: "row-2" }],
    error: null,
  };
  const tableResponses = opts.tableResponses ?? {};
  const calls = {
    update: [] as { arg: unknown }[],
    eq: [] as { col: string; val: unknown }[],
    rpc: [] as { name: string; args: Record<string, unknown> }[],
  };

  const builder = (table: string): unknown => {
    const returns = tableResponses[table] ?? updateReturns;
    const b: Record<string, unknown> = {
      select() { return b; },
      eq(col: string, val: unknown) { calls.eq.push({ col, val }); return b; },
      neq() { return b; },
      in() { return b; },
      update(arg: unknown) { calls.update.push({ arg }); return b; },
      upsert(arg: unknown) { calls.update.push({ arg }); return b; },
      insert(arg: unknown) { calls.update.push({ arg }); return b; },
      delete() { return b; },
      single() {
        const data = returns.data;
        const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
        return Promise.resolve({ data: first, error: returns.error });
      },
      maybeSingle() {
        const data = returns.data;
        const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
        return Promise.resolve({ data: first, error: returns.error });
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return Promise.resolve(returns).then(onFulfilled, onRejected);
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
