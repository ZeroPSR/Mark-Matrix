import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index.js";

// GET /api/me — who the caller is.
//
// The `name` is what the front end shows in the header and on the
// dashboard. It has to come from the `profiles` row: an admin can rename a
// user, and that only updates `profiles.name` — the copy in the sign-up
// metadata is whatever it was at sign-up.

const mockGetUser = vi.fn();

/** The row the profiles table holds for the caller. */
let profileRow: { name: string } | null = null;
/** Set to make the profiles read fail. */
let profileError: { message: string } | null = null;

function makeClient(): unknown {
  const chain: Record<string, unknown> = {};
  chain["select"] = () => chain;
  chain["eq"] = () => chain;
  chain["maybeSingle"] = () =>
    Promise.resolve({ data: profileRow, error: profileError });
  chain["then"] = (
    onFulfilled?: (v: unknown) => unknown,
    onRejected?: (r: unknown) => unknown,
  ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
  return {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: () => chain,
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
    data: { user: { id: "u-1", app_metadata: { role } } },
    error: null,
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  profileRow = { name: "Anita Rao" };
  profileError = null;
});

describe("GET /api/me", () => {
  it("returns the caller's id, role and display name", async () => {
    asRole("admin");
    const res = await app.request("/api/me", { headers: AUTH }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      userId: "u-1",
      role: "admin",
      name: "Anita Rao",
    });
  });

  it("returns a null name when the profile row cannot be read", async () => {
    asRole("admin");
    profileRow = null;
    const res = await app.request("/api/me", { headers: AUTH }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string | null };
    expect(body.name).toBeNull();
  });

  it("still answers when the profiles read fails", async () => {
    asRole("faculty");
    profileError = { message: "permission denied" };
    const res = await app.request("/api/me", { headers: AUTH }, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; role: string; name: string | null };
    expect(body.userId).toBe("u-1");
    expect(body.role).toBe("faculty");
    expect(body.name).toBeNull();
  });

  it("answers 401 without a session", async () => {
    const res = await app.request("/api/me", {}, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "missing_authorization" });
  });
});
