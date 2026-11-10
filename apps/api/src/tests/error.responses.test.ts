import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index.js";

// Every response the API sends has to be JSON.
//
// The front end parses every response body with `JSON.parse`. Hono's
// default answers are plain text — "404 Not Found" for an unmatched path,
// "Internal Server Error" for an unhandled throw — and the front end turns
// either of those into the string "parse_failed". That is how a worker
// missing its Supabase secret (getSupabase() throws "supabaseUrl is
// required.") presented as a front-end parsing bug.

const mockGetUser = vi.fn();

/** Set to true to make every database call blow up. */
let dbBroken = false;

function makeClient(): unknown {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select", "eq", "neq", "in", "order", "limit", "range", "filter",
    "gte", "lte", "gt", "lt", "not", "is", "insert", "update", "upsert", "delete",
    "single", "maybeSingle", "rpc", "match",
  ];
  for (const m of methods) chain[m] = () => chain;
  chain["then"] = (onFulfilled?: (v: unknown) => unknown, onRejected?: (r: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null, count: 0 }).then(onFulfilled, onRejected);
  return {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: () => {
      if (dbBroken) throw new Error("supabaseUrl is required.");
      return chain;
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: () => makeClient() }));

const env = {
  ENVIRONMENT: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-svc",
};
const AUTH = { authorization: "Bearer valid.jwt.xyz" };

function asRole(role: "admin" | "faculty" | "student"): void {
  mockGetUser.mockResolvedValue({
    data: { user: { id: `${role}-1`, app_metadata: { role } } },
    error: null,
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  dbBroken = false;
});

describe("error responses are JSON", () => {
  it("answers an unmatched path with a JSON 404", async () => {
    asRole("admin");
    const res = await app.request("/api/nope/not/a/route", { headers: AUTH }, env);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("json");
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("answers an unhandled throw with a JSON 500", async () => {
    asRole("admin");
    dbBroken = true;
    const res = await app.request("/api/admin/batches", { headers: AUTH }, env);
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("json");
    expect(await res.json()).toEqual({ error: "internal_error" });
  });

  it("answers a throw in the auth middleware with a JSON 500 too", async () => {
    // The failure that started this: the worker has no SUPABASE_URL, so
    // getSupabase() throws before any route runs.
    mockGetUser.mockImplementation(() => {
      throw new Error("supabaseUrl is required.");
    });
    const res = await app.request("/api/me", { headers: AUTH }, env);
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toContain("json");
    expect(await res.json()).toEqual({ error: "internal_error" });
  });

  it("still answers a missing authorization header with JSON", async () => {
    const res = await app.request("/api/admin/batches", {}, env);
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toContain("json");
    expect(await res.json()).toEqual({ error: "missing_authorization" });
  });
});
