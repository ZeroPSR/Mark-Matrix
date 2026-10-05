# Cycle 8b — Security Hardening + Admin Audit-Log UI (Design Spec)

**Status:** Draft, awaiting review.
**Branch context:** `main`; cycle 8a (audit logging foundation) just shipped. Cycle 8c (production deploy + monitoring) deferred to after 8b.
**Goal:** Surface the `audit_log` data captured in 8a to admins via a Hono route + React page, add basic rate limiting across the API, and produce a written security review of RLS / middleware / secret posture.

---

## 1. Scope

**In scope:**

- Admin Hono route at `/api/admin/audit-log` with filters (user_id, entity, action, date range), pagination (50/page, max 200), and a CSV export endpoint at `/api/admin/audit-log/export.csv`.
- React admin page `AuditLogPage.tsx` mounted at `/admin/audit-log`: filter bar, paginated table, row expansion for old/new JSON, CSV export button.
- General rate limiting on all `/api/*` routes (per-IP, sliding window) and tighter limits on the two bulk-upload endpoints.
- Security review markdown report at `docs/superpowers/reviews/2026-10-05-cycle-8b-security-review.md` covering RLS re-verification, middleware order, and secret scan.
- Tests for the new API route, rate limiter, and React page.

**Out of scope (deferred to later cycles):**

- KV-backed rate limiting (cycle 8c hardening item).
- Real-time audit-log streaming / websockets.
- Audit-log diff visualization (e.g., field-level changes in the UI).
- Email-based user lookup beyond what the existing `/api/admin/users` endpoint already supports.
- The cycle-8 spec mentioned "rate limiting on login" — the project has no API login route (auth happens client-side via Supabase); replaced with general API rate limiting. Documented in the review report.

---

## 2. Data Layer

**No new migrations.** Cycle 8a's `audit_log` table, indexes, RLS policy, and `audit_log_write` function are reused. The 8a indexes match every filter pattern the 8b UI needs:

- `(entity, entity_id, created_at DESC)` for `WHERE entity = ? AND entity_id = ?`
- `(user_id, created_at DESC)` for `WHERE user_id = ?`
- `(created_at DESC)` for date-range and unfiltered queries

**One small API extension:** the existing `GET /api/admin/users` route currently returns `user_id, name, role` (read from `public.profiles` via the RLS-bound client). The audit-log UI needs to show user emails, so we extend the response to include `email`. The RLS-bound client cannot read `auth.users` for arbitrary users, so this uses a service-role Supabase client constructed from `env.SUPABASE_SERVICE_ROLE_KEY` (admin-only endpoint, the key is server-side only and never reaches the React bundle — verified by the secret-scan section of the review report). The service-role client is created in a small helper `apps/api/src/lib/serviceRoleClient.ts` and used only by the extended users route. This is a small additive change inside the 8b code path; it does not break the existing admin users UI which ignores extra fields.

---

## 3. API Design

### 3.1 `GET /api/admin/audit-log`

**Mount:** under the existing `app.use("/api/admin/*", requireRole("admin"))` in `apps/api/src/index.ts`.

**Query params** (all optional, validated by zod):

| Param | Type | Notes |
|---|---|---|
| `user_id` | uuid | exact match |
| `entity` | enum | `attendance`, `marks`, `gradesheet`, `enrollment`, `faculty_assignment`, `user`, `grade_scheme` |
| `action` | enum | `create`, `update`, `delete`, `submit`, `approve`, `lock`, `unlock`, `compile`, `publish` |
| `from` | ISO date | `created_at >= from` |
| `to` | ISO date | `created_at <= to` |
| `page` | int, default 1 | 1-indexed |
| `pageSize` | int, default 50, max 200 | |

**Response:**
```ts
{
  data: AuditLogRow[];
  page: number;
  pageSize: number;
  total: number;
}

interface AuditLogRow {
  id: number;
  created_at: string;
  user_id: string;
  action: string;
  entity: string;
  entity_id: string;
  old_value: unknown | null;
  new_value: unknown | null;
}
```

**Sort:** `created_at DESC, id DESC` (id tie-break for stable pagination).

**Implementation:** one Supabase query using `.select("*", { count: "exact" })` with `.eq`/`.gte`/`.lte` for filters and `.range(from, to)` for the page slice. RLS: `audit_log_admin_select` policy from cycle 8a — admin SELECT only.

### 3.2 `GET /api/admin/audit-log/export.csv`

Same query params as the list endpoint, **minus** `page` and `pageSize`. Streams all matching rows.

**Response:**
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="audit-log-YYYY-MM-DD.csv"`
- CSV columns: `created_at, user_id, action, entity, entity_id, old_value, new_value`
- `old_value` / `new_value` are serialized to single-cell JSON strings (CSV escape rule: wrap in `"…"`, double internal quotes).

**Implementation:** `apps/api/src/lib/auditLogCsv.ts` — pure function `toCsv(rows): string` for unit testing.

### 3.3 Error responses

- 400 on invalid query params (zod failure) — `{"error":"validation_failed","fields":[...]}`
- 401 on unauthenticated (handled by `supabaseAuth` middleware)
- 403 on non-admin (handled by `requireRole("admin")` middleware)
- 500 on Supabase error — `{"error":"internal_error","detail":"..."}`

---

## 4. React Page Design

**File:** `apps/web/src/pages/admin/AuditLogPage.tsx`

**Route wiring:** in `App.tsx`, add `<Route path="/admin/audit-log" element={<ProtectedRoute role="admin"><AuditLogPage /></ProtectedRoute>} />`. The existing `AppShell` already surfaces admin nav links; the new page is added to the admin nav.

**Layout:**

```
+-------------------------------------------------------+
| [User ___] [Entity ▼] [Action ▼] [From] [To]         |
| [Apply] [Reset]                          [↓ CSV]      |
+-------------------------------------------------------+
| Timestamp          | User    | Action  | Entity  | ID |
+-------------------------------------------------------+
| 2026-10-05 12:34   | alice@… | update  | marks   | m1 |
| 2026-10-05 12:33   | bob@…   | submit  | marks   | m2 |
| 2026-10-05 12:30   | admin@… | lock    | marks   | c1 |  <- expanded
|   old_value: { status: "approved", … }                     |
|   new_value: { status: "locked", … }                       |
+-------------------------------------------------------+
| ◄ Prev         Page 1 of 12          Next ►           |
+-------------------------------------------------------+
```

**User email resolution:** on mount, fetch `GET /api/admin/users` once to build a `Map<user_id, { email, name }>`. Show email in the table; fall back to truncated id (first 8 chars) if the user is no longer in the system.

**Row expansion:** clicking a row toggles a `<pre>` block beneath it with `JSON.stringify(old_value, null, 2)` and the same for `new_value`. One row expanded at a time.

**State:** `useState` for filter form, pagination, expanded row id, loading, error. A `useEffect` re-fires the query when filters or page change.

**CSV export:** button constructs the current filter as query params, fetches the CSV endpoint, converts to a Blob, triggers a download via a temporary `<a>` element. Reuses the same pattern as `apps/web/src/components/DownloadTranscriptButton.tsx`.

**Loading / error / empty:** standard spinner / error banner / empty-state copy.

**Tests (`apps/web/src/tests/AuditLogPage.test.tsx`):**
- Renders the filter bar
- Renders rows from a mocked API response
- Click row → JSON block appears
- Click row again → JSON block collapses
- Apply filters triggers a new query with the right params
- Pagination prev/next updates page state
- Export CSV triggers a download (mock `URL.createObjectURL`)

---

## 5. Rate Limiting

**Library:** `hono-rate-limiter` (Hono's official middleware; in-memory store; one new dep on `apps/api`).

**Limits (sliding window):**

| Scope | Limit | Notes |
|---|---|---|
| All `/api/*` routes | 120 requests / minute per IP | General API throttle |
| `/api/admin/enrollments/bulk` | 10 requests / minute per IP | Tighter — heavy write |
| `/api/faculty/.../marks/bulk` | 10 requests / minute per IP | Tighter — heavy write |

**Client IP source:** `cf-connecting-ip` header (Cloudflare), fallback to first segment of `x-forwarded-for`, fallback to a sentinel string (all such requests share a bucket — acceptable for 8b).

**429 response shape:**
```json
{ "error": "rate_limited", "detail": "Too many requests. Try again in 30s." }
```
Plus `Retry-After: <seconds>` header.

**Mount points in `apps/api/src/index.ts`** (in order, after CORS and `supabaseAuth`):
```ts
app.use("/api/*", generalRateLimit);
app.use("/api/admin/enrollments/bulk", bulkRateLimit);
app.use("/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks/bulk", bulkRateLimit);
```

**Limitation (documented in the review report):** in-memory state is per-isolate, so a request can land on a different isolate and bypass the count. Acceptable for "basic" per the cycle-8 spec. KV-backed rate limiting is a cycle-8c hardening item.

**Tests (`apps/api/src/tests/rateLimit.test.ts`):**
- 120 requests under the general limit → all pass
- 121st request → 429 with `Retry-After`
- After the window slides past, requests succeed again
- Different IPs are tracked independently
- Bulk-upload tighter limit triggers before the general one

---

## 6. Security Review Report

**File:** `docs/superpowers/reviews/2026-10-05-cycle-8b-security-review.md` (written after 8b implementation lands, so it reports on the actual state of the code).

**Sections:**

1. **RLS re-verification matrix** — for each table from cycles 1-7 (and `audit_log` from 8a):
   - Admin: read / write verdict
   - Faculty: read / write verdict (with scope)
   - Student: read / write verdict (with scope)
   - Verdict: ✓ matches access matrix / ⚠ deviation (with explanation) / ✗ violation (must fix in 8b)
   - Source: each row cites the migration file and policy name

2. **Middleware order check** — print the actual middleware chain from `apps/api/src/index.ts`, confirm CORS → `supabaseAuth` → `requireRole` per prefix → handlers, and confirm no handler is mounted before auth runs. Verdict.

3. **Secret scan** — grep the built React bundle (`apps/web/dist/`) and the source for `SUPABASE_SERVICE_ROLE_KEY`, `service_role` literals, JWT-shaped strings, API tokens. Verdict per finding.

4. **Findings & follow-ups** — list deviations/violations; mark "ship-blocking" (must fix in 8b) vs "defer to 8c" (e.g., KV-backed rate limiting). Each finding has a verdict and a clear next-step owner.

**Out of scope for the report:** per-test-file RLS verification. The existing per-route RBAC tests cover the access matrix at the route level; the report is the human-readable summary.

---

## 7. Testing Strategy

**New test files:**

```
apps/api/src/tests/
├── auditLog.api.test.ts          # admin route: filters, pagination, CSV, RBAC (401/403)
└── rateLimit.test.ts             # sliding window, 429, Retry-After, per-IP isolation, bulk tighter

apps/web/src/tests/
└── AuditLogPage.test.tsx         # table render, filter apply, expand, pagination, CSV download
```

**Doc deliverable:**

```
docs/superpowers/reviews/2026-10-05-cycle-8b-security-review.md
```

**Out of scope for 8b tests:**

- Cross-role access matrix as a separate test file (existing per-route RBAC tests cover this; the report summarizes).

---

## 8. File Structure

```
supabase/migrations/                                 (no new files)
apps/api/src/
├── routes/admin/auditLog.ts                         NEW
├── lib/auditLogCsv.ts                               NEW
├── middleware/rateLimit.ts                          NEW
├── index.ts                                         MODIFY (mount audit-log route, rate-limit middleware)
└── tests/
    ├── auditLog.api.test.ts                         NEW
    └── rateLimit.test.ts                            NEW

apps/web/src/
├── pages/admin/AuditLogPage.tsx                     NEW
├── App.tsx                                          MODIFY (add /admin/audit-log route)
├── components/AdminNav.tsx (or AppShell)            MODIFY (add nav link)
└── tests/AuditLogPage.test.tsx                      NEW

packages/shared/src/
└── auditLog.ts                                      NEW (zod schema for query + response, re-export AuditAction/AuditEntity from 8a)

docs/superpowers/reviews/2026-10-05-cycle-8b-security-review.md   NEW (after implementation)
```

**Dependency changes:** one new dep — `hono-rate-limiter` on `apps/api`. Pinned to a recent stable version.

---

## 9. Open Questions / Follow-ups

None for 8b. Items deferred to 8c:

- KV-backed rate limiting.
- Real-time audit-log streaming.
- Audit-log retention policy (currently unbounded).
- Audit-log email alerts for high-risk actions (e.g., role changes).
