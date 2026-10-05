# Cycle 8b — Security Hardening + Admin Audit-Log UI (Implementation Plan, Part 3)

**Plan files:**
- [Part 1: Tasks 1–3 — service-role helper, audit-log API, schemas](./2026-10-05-cycle-8b-security-hardening-part1.md)
- [Part 2: Tasks 4–6 — users email extension, rate limit middleware, integration](./2026-10-05-cycle-8b-security-hardening-part2.md)
- [Part 3 (this file): Tasks 7–9 — React page, security review report, final pass](./2026-10-05-cycle-8b-security-hardening-part3.md)

**Spec:** [docs/superpowers/specs/2026-10-05-cycle-8b-security-hardening-design.md](../specs/2026-10-05-cycle-8b-security-hardening-design.md)

---

## Task 7: React `AuditLogPage` + tests

**Files:**
- Create: `apps/web/src/pages/admin/AuditLogPage.tsx`
- Test: `apps/web/src/tests/AuditLogPage.test.tsx`
- Modify: `apps/web/src/App.tsx` (add the route)
- Modify: `apps/web/src/shell/AppShell.tsx` (add the nav link)

**Interfaces:**
- Consumes: `auditLogListQuerySchema`, `AuditLogRow` from `@mark-matrix/shared`. The existing `AuthContext` for the user's JWT (used in the fetch header).
- Produces: a new admin page mounted at `/admin/audit-log` behind the existing `ProtectedRoute role="admin"`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/tests/AuditLogPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthContext, type AuthValue } from "../auth/AuthContext.js";
import { AuditLogPage } from "../pages/admin/AuditLogPage.js";

const authValue: AuthValue = {
  userId: "admin-1",
  role: "admin",
  accessToken: "test-token",
  loading: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
};

const fakeRows = [
  {
    id: 1,
    created_at: "2026-10-05T10:00:00Z",
    user_id: "u-1",
    action: "update",
    entity: "marks",
    entity_id: "m1",
    old_value: { status: "draft" },
    new_value: { status: "approved" },
  },
];

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: fakeRows, page: 1, pageSize: 50, total: 1 }),
    text: async () => "",
    blob: async () => new Blob(),
    headers: new Headers({ "content-type": "application/json" }),
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <AuditLogPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe("AuditLogPage", () => {
  it("renders the filter bar and a row from the API response", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/update/)).toBeInTheDocument();
    });
    expect(screen.getByText(/marks/)).toBeInTheDocument();
    expect(screen.getByText(/m1/)).toBeInTheDocument();
  });

  it("clicking a row toggles a JSON block with old/new values", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/update/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText(/m1/));
    expect(screen.getByText(/"status": "draft"/)).toBeInTheDocument();
    expect(screen.getByText(/"status": "approved"/)).toBeInTheDocument();
    // Click again to collapse.
    fireEvent.click(screen.getByText(/m1/));
    expect(screen.queryByText(/"status": "draft"/)).not.toBeInTheDocument();
  });

  it("applying filters triggers a new query with the right params", async () => {
    renderPage();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const applyBtn = screen.getByRole("button", { name: /apply/i });
    const userIdInput = screen.getByLabelText(/user/i);
    fireEvent.change(userIdInput, { target: { value: "11111111-1111-1111-1111-111111111111" } });
    fireEvent.click(applyBtn);
    await waitFor(() => {
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as [string, RequestInit];
      expect(lastCall[0]).toMatch(/userId=11111111-1111-1111-1111-111111111111/);
    });
  });

  it("pagination next updates the page state", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: fakeRows, page: 1, pageSize: 50, total: 60 }),
      text: async () => "",
      blob: async () => new Blob(),
      headers: new Headers({ "content-type": "application/json" }),
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/update/)).toBeInTheDocument();
    });
    const nextBtn = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextBtn);
    await waitFor(() => {
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1] as [string];
      expect(lastCall[0]).toMatch(/page=2/);
    });
  });

  it("export CSV button triggers a download", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: fakeRows, page: 1, pageSize: 50, total: 1 }),
      headers: new Headers({ "content-type": "application/json" }),
    });
    // Second call: the CSV export.
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: async () => new Blob(["created_at,user_id,action,entity,entity_id,old_value,new_value\n"]),
      headers: new Headers({
        "content-type": "text/csv",
        "content-disposition": 'attachment; filename="audit-log-2026-10-05.csv"',
      }),
    });
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/update/)).toBeInTheDocument();
    });
    const exportBtn = screen.getByRole("button", { name: /export/i });
    fireEvent.click(exportBtn);
    await waitFor(() => {
      const csvCalls = fetchSpy.mock.calls.filter((c) => (c[0] as string).includes("export.csv"));
      expect(csvCalls.length).toBeGreaterThan(0);
    });
    expect(createObjectURL).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mark-matrix/web test AuditLogPage`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the page**

Create `apps/web/src/pages/admin/AuditLogPage.tsx`. The page is single-file for 8b; can be split later if it grows. Outline:

```tsx
import { useEffect, useState, useMemo, useCallback } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { auditLogListQuerySchema, type AuditLogRow, type AuditLogListResponse } from "@mark-matrix/shared";

const PAGE_SIZE = 50;

export function AuditLogPage() {
  const { accessToken } = useAuth();
  const [userId, setUserId] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Build a users map for email lookup. Fetched once.
  const [userMap, setUserMap] = useState<Record<string, { email: string | null; name: string }>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const body = (await res.json()) as { users: { user_id: string; email: string | null; name: string }[] };
      if (cancelled) return;
      const map: Record<string, { email: string | null; name: string }> = {};
      for (const u of body.users) map[u.user_id] = { email: u.email, name: u.name };
      setUserMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (userId) params.set("userId", userId);
    if (entity) params.set("entity", entity);
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    return params.toString();
  }, [userId, entity, action, from, to, page]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const res = await fetch(`/api/admin/audit-log?${queryString}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (cancelled) return;
      if (!res.ok) {
        setError(`Failed to load audit log: ${res.status}`);
        setLoading(false);
        return;
      }
      const body = (await res.json()) as AuditLogListResponse;
      setData(body.data);
      setTotal(body.total);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [queryString, accessToken]);

  const onApply = useCallback(() => {
    setPage(1);
  }, []);

  const onReset = useCallback(() => {
    setUserId("");
    setEntity("");
    setAction("");
    setFrom("");
    setTo("");
    setPage(1);
  }, []);

  const onExport = useCallback(async () => {
    const res = await fetch(`/api/admin/audit-log/export.csv?${queryString.replace(/page=\d+&?|pageSize=\d+&?/g, "")}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [queryString, accessToken]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1>Audit Log</h1>
      <div>
        <label>User <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="user_id (uuid)" /></label>
        <label>Entity
          <select value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">All</option>
            <option value="attendance">attendance</option>
            <option value="marks">marks</option>
            <option value="gradesheet">gradesheet</option>
            <option value="enrollment">enrollment</option>
            <option value="faculty_assignment">faculty_assignment</option>
            <option value="user">user</option>
            <option value="grade_scheme">grade_scheme</option>
          </select>
        </label>
        <label>Action
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All</option>
            <option value="create">create</option>
            <option value="update">update</option>
            <option value="delete">delete</option>
            <option value="submit">submit</option>
            <option value="approve">approve</option>
            <option value="lock">lock</option>
            <option value="unlock">unlock</option>
            <option value="compile">compile</option>
            <option value="publish">publish</option>
          </select>
        </label>
        <label>From <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button onClick={onApply}>Apply</button>
        <button onClick={onReset}>Reset</button>
        <button onClick={onExport}>Export CSV</button>
      </div>
      {error && <div role="alert">{error}</div>}
      {loading ? (
        <div>Loading…</div>
      ) : data.length === 0 ? (
        <div>No audit log rows match these filters.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Entity</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const u = userMap[row.user_id];
              const userLabel = u?.email ?? row.user_id.slice(0, 8);
              const isExpanded = expandedId === row.id;
              return (
                <>
                  <tr key={row.id} onClick={() => setExpandedId(isExpanded ? null : row.id)} style={{ cursor: "pointer" }}>
                    <td>{row.created_at}</td>
                    <td>{userLabel}</td>
                    <td>{row.action}</td>
                    <td>{row.entity}</td>
                    <td>{row.entity_id}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={5}>
                        <pre>{`old_value: ${JSON.stringify(row.old_value, null, 2)}`}</pre>
                        <pre>{`new_value: ${JSON.stringify(row.new_value, null, 2)}`}</pre>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
      <div>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
        <span> Page {page} of {totalPages} </span>
        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
      </div>
    </div>
  );
}

export default AuditLogPage;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mark-matrix/web test AuditLogPage`
Expected: PASS — 5 tests pass. (Some tests may need a `react-router-dom` test helper; if the project doesn't have a router wrapper helper, follow the existing pattern in `apps/web/src/tests/`.)

- [ ] **Step 5: Wire the route in `App.tsx` and add the nav link**

Edit `apps/web/src/App.tsx` to add the new route. The pattern matches existing admin pages:

```tsx
import { AuditLogPage } from "./pages/admin/AuditLogPage.js";
// ...
<Route
  path="/admin/audit-log"
  element={
    <ProtectedRoute role="admin">
      <AuditLogPage />
    </ProtectedRoute>
  }
/>
```

Edit `apps/web/src/shell/AppShell.tsx` to add a nav link. The pattern matches existing admin links. The exact location depends on the file's structure — find the admin nav block and add:

```tsx
<NavLink to="/admin/audit-log">Audit Log</NavLink>
```

- [ ] **Step 6: Run lint + typecheck**

```bash
pnpm --filter @mark-matrix/web lint
pnpm --filter @mark-matrix/web typecheck
```
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/admin/AuditLogPage.tsx apps/web/src/tests/AuditLogPage.test.tsx apps/web/src/App.tsx apps/web/src/shell/AppShell.tsx
git commit -m "feat(web): admin audit-log page with filters, pagination, CSV download

Cycle 8b. /admin/audit-log page renders the cycle-8a audit_log rows
with filter bar (user, entity, action, from, to), paginated table
(50/page), row expansion to show old/new JSON, and a CSV download
button that mirrors the current filter to the export endpoint. User
emails are resolved once via /api/admin/users (cycle 8b extended
that endpoint to include email).

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 8: Security review report

**Files:**
- Create: `docs/superpowers/reviews/2026-10-05-cycle-8b-security-review.md`

**Interfaces:**
- Consumes: every migration in `supabase/migrations/` and the current state of `apps/api/src/index.ts`, `apps/api/src/routes/**`, `apps/web/src/**`.
- Produces: a markdown review document with three sections (RLS matrix, middleware order, secret scan) and a findings list.

- [ ] **Step 1: Read every RLS migration**

```bash
ls supabase/migrations/
```

For each migration, read the file and identify:
- Which tables are created/modified
- Which RLS policies are added (or "no RLS change")
- The action each policy allows (SELECT / INSERT / UPDATE / DELETE) and for which role (`authenticated`, `anon`, custom)

- [ ] **Step 2: Build the RLS matrix table**

For each table from cycles 1-7 (and 8a), write a row in the matrix:

```
| Table | Admin (read/write) | Faculty (read/write) | Student (read/write) | Source |
|-------|--------------------|----------------------|----------------------|--------|
```

The "verdict" column is one of:
- ✓ — matches the access matrix in the spec
- ⚠ — deviation, with explanation
- ✗ — violation, must fix

The "Source" column cites the migration filename and policy name. For example:
```
| marks | R: all rows; W: own course rows | R: own course rows; W: own course rows | R: own student_id | supabase/migrations/20260820100009_marks.sql (policy "marks_faculty_select", "marks_student_select") |
```

The access matrix the matrix is checked against comes from the cycle 8a spec §1 (Admin / Faculty / Student × read / write × each entity).

- [ ] **Step 3: Verify middleware order in `apps/api/src/index.ts`**

Confirm:
1. `cors` is mounted first (`*`).
2. `app.use("/api/*", supabaseAuth)` is mounted before any `/api/*` route.
3. `app.use("/api/admin/*", requireRole("admin"))` is mounted before any admin route.
4. No handler is mounted at a path that bypasses the `supabaseAuth` middleware (e.g., a route at `/api/admin/users` mounted before `requireRole("admin")`).

Print the actual order in the report:

```
Middleware order (top-to-bottom in apps/api/src/index.ts):
1. cors(*) — every request
2. /api/* supabaseAuth — populates userId, role, supabase
3. /api/admin/* requireRole("admin") — gates admin routes
4. /api/faculty/* requireRole("faculty") — gates faculty routes
5. /api/student/* requireRole("student") — gates student routes
6. /api/* generalRateLimit (cycle 8b) — rate-limit gate after auth
7. /api/admin/enrollments/bulk bulkRateLimit (cycle 8b)
8. /api/faculty/.../marks/bulk bulkRateLimit (cycle 8b)
9. (route handlers)
```

Verdict: ✓ or ⚠ with findings.

- [ ] **Step 4: Run the secret scan**

Run from the repo root:

```bash
# 1. Build the web app so dist/ exists (if not already built):
pnpm --filter @mark-matrix/web build

# 2. Scan the built bundle for service-role markers, JWTs, anon keys:
grep -rE "service_role|SUPABASE_SERVICE_ROLE_KEY|eyJ[A-Za-z0-9_-]{20,}" apps/web/dist/ 2>&1 | head -20

# 3. Scan the source for any client-side import of the service-role client:
grep -rE "serviceRoleClient|SUPABASE_SERVICE_ROLE_KEY|getServiceRoleClient" apps/web/src/

# 4. Scan the React source for any env var that holds a secret:
grep -rE "process\.env\.[A-Z_]+" apps/web/src/ | grep -vE "process\.env\.(VITE_)?(NODE_ENV|PUBLIC_)"
```

Each scan result is a finding. Document the verdict per finding.

Expected outcome (the cycle 8b implementation puts the service-role helper under `apps/api/src/`, so the apps/web scan should be empty):
- `apps/web/dist/` — no service-role markers
- `apps/web/src/` — no service-role client imports
- `apps/web/src/` env var scan — only public/Vite-prefixed vars

- [ ] **Step 5: Write the report**

Create `docs/superpowers/reviews/2026-10-05-cycle-8b-security-review.md`. Use this skeleton, fill in the actual findings:

```markdown
# Cycle 8b Security Review

**Date:** 2026-10-05
**Reviewer:** Claude (cycle 8b implementation)
**Scope:** Mark-Matrix API + frontend, post-cycle-8a.

## 1. RLS Re-Verification Matrix

| Table | Admin (read/write) | Faculty (read/write) | Student (read/write) | Source | Verdict |
|-------|--------------------|----------------------|----------------------|--------|---------|
| profiles | ... | ... | ... | 20260818100001_profiles_rls.sql | ✓ |
| ... | ... | ... | ... | ... | ... |

(Fill in for every table. Each row cites the migration file and policy name.)

## 2. Middleware Order

(Paste the order from Step 3. Verdict per check.)

## 3. Secret Scan

(Paste the grep outputs from Step 4. Verdict per finding.)

## 4. Findings & Follow-ups

(List any ⚠ or ✗ findings. For each, mark "ship-blocking" (must fix in 8b) or "defer to 8c" (e.g., KV-backed rate limiting). Owner: <whoever addresses it>.)
```

- [ ] **Step 6: Commit the report**

```bash
git add docs/superpowers/reviews/2026-10-05-cycle-8b-security-review.md
git commit -m "docs: cycle-8b security review report

Cycle 8b. RLS re-verification matrix covering all tables from cycles
1-7 plus audit_log. Middleware order check (CORS → supabaseAuth →
requireRole per prefix → rate limits → handlers). Secret scan of the
React bundle and source for any service-role leakage. Findings list
with ship-blocking vs deferred verdicts.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9: Final pass — full test suite, lint, typecheck, retro

**Files:** none (final pass task).

- [ ] **Step 1: Run the full test suite (api + web)**

```bash
pnpm test
```
Expected: all tests pass. The 120-req smoke in the rate limit unit test is the slowest (~1s); everything else is fast.

If any pre-existing test fails, it's a regression — fix the underlying handler or update the test if the change is intentional. Do NOT skip existing tests.

- [ ] **Step 2: Run lint at the repo root**

```bash
pnpm lint
```
Expected: clean.

- [ ] **Step 3: Run typecheck at the repo root**

```bash
pnpm typecheck
```
Expected: clean across all packages.

- [ ] **Step 4: Write a brief cycle-8b retro**

Append to `docs/superpowers/plans/2026-10-05-cycle-8b-retro.md` covering:
- Number of audit-log rows emitted per action type in the local dev DB after a smoke run (sanity check that volume is reasonable).
- Any follow-ups surfaced during implementation (e.g., if the rate limit unit test was slow, flag for cycle 8c).
- A note that cycle 8c (production deploy) can now build on the security-hardened foundation.

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/plans/2026-10-05-cycle-8b-retro.md
git commit -m "docs: cycle-8b retro and follow-up notes

Cycle 8b complete. Admin audit-log UI, full security review report,
general + bulk rate limiting. Cycle 8c (production deploy + KV-backed
rate limiting) can now build on the security-hardened foundation.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

- [ ] **Step 6: Report completion**

Report back to the user:
- Cycle 8b is complete.
- All tests pass.
- Audit log is now browsable + filterable + exportable from the admin UI.
- Rate limiting is in place.
- Security review report committed.
- Ready to start cycle 8c (production deploy + monitoring + smoke test).

---

**End of plan.**
