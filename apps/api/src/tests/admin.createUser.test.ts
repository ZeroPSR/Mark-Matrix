import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index.js";

// Creating a user.
//
// A user is three rows: the auth account, the `profiles` row, and the role
// satellite that carries the identity. The satellite's identity columns are
// NOT NULL, and nothing else in the app can fill them — so creating a user
// without one leaves them invisible to every roster.

const mockGetUser = vi.fn();
const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockListUsers = vi.fn();

interface Recorded {
  table: string;
  row: Record<string, unknown>;
}
const inserts: Recorded[] = [];
const updates: Recorded[] = [];
const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];

/** The table whose insert should fail, and the Postgres error it reports. */
let failingTable: string | null = null;

function makeChain(table: string): Record<string, unknown> {
  let row: Record<string, unknown> | null = null;
  const chain: Record<string, unknown> = {};
  const methods = [
    "select", "eq", "neq", "in", "order", "limit", "range", "filter",
    "gte", "lte", "gt", "lt", "not", "is", "upsert", "delete",
    "rpc", "match",
  ];
  for (const m of methods) chain[m] = () => chain;
  chain["insert"] = (r: Record<string, unknown>) => {
    row = r;
    inserts.push({ table, row: r });
    return chain;
  };
  chain["update"] = (u: Record<string, unknown>) => {
    row = u;
    updates.push({ table, row: u });
    return chain;
  };
  const result = (): { data: unknown; error: unknown } =>
    failingTable === table
      ? { data: null, error: { code: "23505", message: "duplicate key value" } }
      : { data: row, error: null };
  chain["single"] = () => Promise.resolve(result());
  chain["maybeSingle"] = () => Promise.resolve(result());
  chain["then"] = (
    onFulfilled?: (v: unknown) => unknown,
    onRejected?: (r: unknown) => unknown,
  ) => Promise.resolve({ data: [], error: null, count: 0 }).then(onFulfilled, onRejected);
  return chain;
}

function makeClient(): unknown {
  return {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
      admin: {
        createUser: (...args: unknown[]) => mockCreateUser(...args),
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
        listUsers: (...args: unknown[]) => mockListUsers(...args),
      },
    },
    from: (table: string) => makeChain(table),
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
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
  mockCreateUser.mockReset();
  mockDeleteUser.mockReset();
  mockListUsers.mockReset();
  inserts.length = 0;
  updates.length = 0;
  rpcs.length = 0;
  failingTable = null;
  mockCreateUser.mockResolvedValue({
    data: { user: { id: "new-user-1" } },
    error: null,
  });
  mockDeleteUser.mockResolvedValue({ data: null, error: null });
});

const STUDENT = {
  email: "New.Student@Example.com",
  name: "New Student",
  role: "student",
  password: "not-a-real-password",
  rollNumber: "23bca014",
  admissionYear: 2023,
};

describe("POST /api/admin/users", () => {
  it("creates the account, sets the role and attaches the identity", async () => {
    asRole("admin");
    const res = await app.request("/api/admin/users", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify(STUDENT),
    }, env);

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { userId: string; role: string } };
    expect(body.data.userId).toBe("new-user-1");
    expect(body.data.role).toBe("student");

    // The auth account, with the name in the metadata the trigger reads.
    expect(mockCreateUser).toHaveBeenCalledTimes(1);
    const created = mockCreateUser.mock.calls[0]?.[0] as {
      email: string;
      password: string;
      user_metadata: { name: string };
    };
    expect(created.email).toBe("new.student@example.com");
    expect(created.password).toBe("not-a-real-password");
    expect(created.user_metadata.name).toBe("New Student");

    // The trigger makes the profile with the role hardcoded to 'student',
    // so the role is set explicitly.
    const profileUpdate = updates.find((u) => u.table === "profiles");
    expect(profileUpdate?.row["role"]).toBe("student");

    // The identity row.
    const satellite = inserts.find((i) => i.table === "student_profiles");
    expect(satellite?.row["user_id"]).toBe("new-user-1");
    expect(satellite?.row["roll_number"]).toBe("23BCA014");
    expect(satellite?.row["admission_year"]).toBe(2023);
  });

  it("attaches a faculty identity for a faculty user", async () => {
    asRole("admin");
    const res = await app.request("/api/admin/users", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({
        email: "f@example.com",
        name: "F Faculty",
        role: "faculty",
        password: "not-a-real-password",
        employeeCode: "emp-01",
        department: "CS",
        designation: "Lecturer",
      }),
    }, env);

    expect(res.status).toBe(201);
    const satellite = inserts.find((i) => i.table === "faculty_profiles");
    expect(satellite?.row["employee_code"]).toBe("EMP-01");
    expect(satellite?.row["department"]).toBe("CS");
    expect(inserts.find((i) => i.table === "student_profiles")).toBeUndefined();
  });

  it("rejects a student with no roll number, before creating anything", async () => {
    asRole("admin");
    const res = await app.request("/api/admin/users", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ ...STUDENT, rollNumber: undefined }),
    }, env);

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: Array<{ path: string }> };
    expect(body.error).toBe("validation_failed");
    expect(body.fields.map((f) => f.path)).toContain("rollNumber");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("rejects a faculty member with no employee code", async () => {
    asRole("admin");
    const res = await app.request("/api/admin/users", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({
        email: "f@example.com",
        name: "F Faculty",
        role: "faculty",
        password: "not-a-real-password",
      }),
    }, env);

    expect(res.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("rejects a password that is too short", async () => {
    asRole("admin");
    const res = await app.request("/api/admin/users", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify({ ...STUDENT, password: "short" }),
    }, env);

    expect(res.status).toBe(400);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("answers 409 when the email is already registered", async () => {
    asRole("admin");
    mockCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });
    const res = await app.request("/api/admin/users", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify(STUDENT),
    }, env);

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("email_taken");
  });

  it("rolls the account back when the identity insert fails", async () => {
    asRole("admin");
    failingTable = "student_profiles";
    const res = await app.request("/api/admin/users", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify(STUDENT),
    }, env);

    // The roll number is taken: a duplicate, not a server fault.
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("duplicate");
    // The account must not survive — it could sign in with no identity.
    expect(mockDeleteUser).toHaveBeenCalledWith("new-user-1");
  });

  it("never writes the password into the audit trail", async () => {
    asRole("admin");
    await app.request("/api/admin/users", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify(STUDENT),
    }, env);

    const audit = rpcs.find((r) => r.fn === "audit_log_write");
    expect(audit).toBeDefined();
    expect(audit?.args["p_action"]).toBe("create");
    expect(audit?.args["p_entity"]).toBe("user");
    expect(JSON.stringify(audit?.args)).not.toContain("not-a-real-password");
  });

  it("is admin-only", async () => {
    asRole("faculty");
    const res = await app.request("/api/admin/users", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify(STUDENT),
    }, env);
    expect(res.status).toBe(403);

    asRole("student");
    const student = await app.request("/api/admin/users", {
      method: "POST",
      headers: { ...AUTH, "content-type": "application/json" },
      body: JSON.stringify(STUDENT),
    }, env);
    expect(student.status).toBe(403);
    expect(mockCreateUser).not.toHaveBeenCalled();
  });
});
