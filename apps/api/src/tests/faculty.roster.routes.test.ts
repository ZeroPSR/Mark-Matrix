import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index.js";

// HTTP-level guard for the faculty roster mounts.
//
// The grant behind these routes was "exactly two read-only endpoints,
// taught-semesters only". The GET-only half of that was enforced structurally
// — `routes/faculty/roster.ts` builds fresh Hono apps with `.get("/")` only,
// so the admin modules' POST/DELETE handlers are not attached — but nothing
// asserted it. A future edit that re-pointed the mount at `adminStudentsRoute`
// would silently expose `POST /api/faculty/students` and
// `DELETE /api/faculty/students/:userId`, and no test would fail.
//
// This file pins that property at the HTTP layer, alongside the role gate and
// the fact that the admin mounts are untouched.

const mockGetUser = vi.fn();

/**
 * `supabaseAuth` sets `c.get("supabase")` to the client `getSupabase` builds
 * with `createClient`, so the route handlers read through this mock. It has
 * to support both `auth.getUser` and a `from().select()` chain.
 */
function makeClient(): unknown {
  const chain = {
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    then(
      onFulfilled?: (value: { data: unknown[]; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
    },
  };
  return {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: () => chain,
  };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => makeClient(),
}));

const env = {
  ENVIRONMENT: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-svc",
};

const AUTH = { authorization: "Bearer valid.jwt.xyz" };

function asRole(role: "admin" | "faculty" | "student"): void {
  mockGetUser.mockResolvedValueOnce({
    data: { user: { id: `${role}-1`, app_metadata: { role } } },
    error: null,
  });
}

beforeEach(() => mockGetUser.mockReset());

describe("faculty roster routes", () => {
  it("serves GET to a faculty session on both mounts", async () => {
    asRole("faculty");
    const students = await app.request("/api/faculty/students", { headers: AUTH }, env);
    expect(students.status).toBe(200);

    asRole("faculty");
    const enrollments = await app.request("/api/faculty/enrollments", { headers: AUTH }, env);
    expect(enrollments.status).toBe(200);
  });

  it("exposes no write route on either faculty mount", async () => {
    const cases: readonly (readonly [string, string])[] = [
      ["/api/faculty/students", "POST"],
      ["/api/faculty/students/u1", "DELETE"],
      ["/api/faculty/enrollments", "POST"],
      ["/api/faculty/enrollments/e1", "DELETE"],
    ];
    for (const [path, method] of cases) {
      asRole("faculty");
      const res = await app.request(path, { method, headers: AUTH }, env);
      expect(res.status, `${method} ${path} must not be handled`).toBe(404);
    }
  });

  it("returns 403 for a student session", async () => {
    asRole("student");
    const res = await app.request("/api/faculty/students", { headers: AUTH }, env);
    expect(res.status).toBe(403);

    asRole("student");
    const enrollments = await app.request("/api/faculty/enrollments", { headers: AUTH }, env);
    expect(enrollments.status).toBe(403);
  });

  it("leaves the admin mounts untouched", async () => {
    // An admin session still reads the roster from the admin mount.
    asRole("admin");
    const students = await app.request("/api/admin/students", { headers: AUTH }, env);
    expect(students.status).toBe(200);

    // The admin mount still has its write route — the point is that the
    // faculty mounts did not gain one, not that the admin mount lost one.
    asRole("admin");
    const write = await app.request(
      "/api/admin/students",
      {
        method: "POST",
        headers: { ...AUTH, "content-type": "application/json" },
        body: JSON.stringify({ userId: "u1", rollNumber: "R1", admissionYear: 2024 }),
      },
      env,
    );
    expect(write.status).not.toBe(404);
    expect(write.status).not.toBe(405);
  });

  it("keeps the admin mounts admin-only", async () => {
    asRole("faculty");
    const res = await app.request("/api/admin/students", { headers: AUTH }, env);
    expect(res.status).toBe(403);
  });
});
