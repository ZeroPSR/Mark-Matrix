import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index.js";

// The routes the real app mounts.
//
// The analytics handlers read a path parameter — and the name they read has
// to be the name the route is *mounted* with. A test that mounts the
// sub-app under different names passes while the real app answers 400
// missing_sem / missing_course, so these go through the real app.

const mockGetUser = vi.fn();

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
  ) => Promise.resolve({ data: [], error: null, count: 0 }).then(onFulfilled, onRejected);
  return chain;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      admin: { listUsers: () => Promise.resolve({ data: { users: [] }, error: null }) },
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

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "u-1", app_metadata: { role: "admin" } } },
    error: null,
  });
});

const SEM = "/api/admin/batch/b1/program/p1/sem/s1";
const COURSE = `${SEM}/course/c1`;

describe("the routes the real app mounts", () => {
  it("answers the semester analytics summary", async () => {
    const res = await app.request(`${SEM}/analytics/summary`, { headers: AUTH }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ courses: [] });
  });

  it("answers the course pass rate", async () => {
    const res = await app.request(`${COURSE}/analytics/pass-rate`, { headers: AUTH }, env);
    expect(res.status).toBe(200);
  });

  it("answers the course toppers", async () => {
    const res = await app.request(`${COURSE}/analytics/toppers`, { headers: AUTH }, env);
    expect(res.status).toBe(200);
  });

  it("answers the course attendance shortage", async () => {
    const res = await app.request(`${COURSE}/analytics/attendance-shortage`, { headers: AUTH }, env);
    expect(res.status).toBe(200);
  });

  it("answers the faculty analytics under the same param names", async () => {
    const res = await app.request(
      "/api/faculty/batch/b1/program/p1/sem/s1/course/c1/analytics/pass-rate",
      { headers: AUTH },
      env,
    );
    // A faculty token would be 403; the point is that it is not 400
    // missing_course — the handler found the course id.
    expect(res.status).not.toBe(400);
  });
});
