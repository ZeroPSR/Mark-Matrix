import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index.js";

// GET /api/admin/users — the list, with each user's email.
//
// The emails come from auth.users, which the service-role client reads one
// page at a time. Reading only the first page left every user past it
// without an email, and an account list longer than one page is normal.

const mockGetUser = vi.fn();
const mockListUsers = vi.fn();

/** The profile rows the profiles table holds. */
let profiles: Array<{ user_id: string; name: string; role: string }> = [];

function makeChain(): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const methods = [
    "select", "eq", "neq", "in", "order", "limit", "range", "filter",
    "gte", "lte", "gt", "lt", "not", "is", "insert", "update", "upsert",
    "delete", "rpc", "match", "single", "maybeSingle",
  ];
  for (const m of methods) chain[m] = () => chain;
  chain["then"] = (
    onFulfilled?: (v: unknown) => unknown,
    onRejected?: (r: unknown) => unknown,
  ) => Promise.resolve({ data: profiles, error: null, count: profiles.length }).then(onFulfilled, onRejected);
  return chain;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      admin: { listUsers: (...args: unknown[]) => mockListUsers(...args) },
    },
    from: () => makeChain(),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}));

const env = {
  ENVIRONMENT: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-svc",
};
const AUTH = { authorization: "Bearer valid.jwt.xyz" };

/** Build an auth user with an id and an email. */
function authUser(index: number): { id: string; email: string; name: string } {
  return { id: `u-${index}`, email: `u${index}@example.com`, name: `User ${index}` };
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockListUsers.mockReset();
  profiles = [];
  mockGetUser.mockResolvedValue({
    data: { user: { id: "u-1", app_metadata: { role: "admin" } } },
    error: null,
  });
});

describe("GET /api/admin/users", () => {
  it("merges the email of every user, across every page", async () => {
    // 250 users: the first page is full, the second has the rest.
    const all = Array.from({ length: 250 }, (_v, i) => authUser(i));
    mockListUsers.mockImplementation(async ({ page }: { page: number }) => {
      const start = (page - 1) * 200;
      return { data: { users: all.slice(start, start + 200) }, error: null };
    });
    profiles = all.map((u) => ({ user_id: u.id, name: u.name, role: "student" }));

    const res = await app.request("/api/admin/users", { headers: AUTH }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Array<{ user_id: string; email: string | null }> };
    expect(body.users).toHaveLength(250);
    // Every one of them has its email — not just the first page.
    expect(body.users.every((u) => u.email !== null)).toBe(true);
    expect(body.users[249]?.email).toBe("u249@example.com");
    // Two pages were read.
    expect(mockListUsers).toHaveBeenCalledTimes(2);
  });

  it("stops after a page that is not full", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [authUser(0)] },
      error: null,
    });
    profiles = [{ user_id: "u-0", name: "A", role: "student" }];

    await app.request("/api/admin/users", { headers: AUTH }, env);
    expect(mockListUsers).toHaveBeenCalledTimes(1);
  });

  it("still lists the profiles when the auth read fails", async () => {
    mockListUsers.mockRejectedValue(new Error("auth is down"));
    profiles = [{ user_id: "u-0", name: "A", role: "student" }];

    const res = await app.request("/api/admin/users", { headers: AUTH }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: Array<{ email: string | null }> };
    expect(body.users).toHaveLength(1);
    expect(body.users[0]?.email).toBeNull();
  });
});
