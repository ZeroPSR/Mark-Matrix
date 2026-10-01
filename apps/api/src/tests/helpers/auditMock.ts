import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mock supabase client for audit tests.
 *
 * Captures: every .update(arg), every .eq(col, val), every .rpc(name, args).
 * Returns: configured data from .update().select(...) and a successful rpc result.
 */
export function makeAuditMockSupabase(opts: {
  updateReturns?: { data: Record<string, unknown>[] | null; error: null | { code: string; message: string } };
} = {}) {
  const updateReturns = opts.updateReturns ?? {
    data: [{ id: "row-1" }, { id: "row-2" }],
    error: null,
  };
  const calls = {
    update: [] as { arg: unknown }[],
    eq: [] as { col: string; val: unknown }[],
    rpc: [] as { name: string; args: Record<string, unknown> }[],
  };

  const builder = (table: string): unknown => {
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
        // Resolve with the first row of updateReturns.data, or null.
        const data = updateReturns.data;
        const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
        return Promise.resolve({ data: first, error: updateReturns.error });
      },
      maybeSingle() {
        const data = updateReturns.data;
        const first = Array.isArray(data) && data.length > 0 ? data[0] : null;
        return Promise.resolve({ data: first, error: updateReturns.error });
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return Promise.resolve(updateReturns).then(onFulfilled, onRejected);
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
