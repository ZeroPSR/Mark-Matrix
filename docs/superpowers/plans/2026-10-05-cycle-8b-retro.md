# Cycle 8b — Security Hardening + Admin Audit-Log UI (Retro)

**Status:** Complete. 9/9 tasks executed inline. Full test suite green: 67 test files pass (api 42 + web 16 + shared 9), 7 skipped, 0 failed. Typecheck clean. Lint clean (0 errors, 20 pre-existing warnings).

**What shipped:**
- New `audit_log` admin API: `GET /api/admin/audit-log` (paginated, filtered) + `GET /api/admin/audit-log/export.csv` (streaming).
- Shared zod schemas (`auditLogListQuerySchema`, `auditLogRowSchema`, `AuditLogListResponse`) — single source of truth for the audit-log query shape, used by both the API and (in future cycles) any other client.
- `AuditAction` and `AuditEntity` unions moved from `apps/api/src/lib/auditLog.ts` (cycle 8a) into `packages/shared/src/auditLog.ts` for shared use.
- `getServiceRoleClient` helper (admin-only, server-side).
- `/api/admin/users` extended to include `email` (read from `auth.users` via the service-role client; verified clean by the secret scan).
- `generalRateLimit` (120 req/min/IP) + `bulkRateLimit` (10 req/min/IP) via `hono-rate-limiter`. In-memory; KV-backed is a cycle-8c item.
- `AuditLogPage` at `/admin/audit-log`: filter bar, paginated table (50/page), row expansion with pretty-printed old/new JSON, CSV download.
- Security review report at `docs/superpowers/reviews/2026-10-05-cycle-8b-security-review.md`: 17-table RLS matrix, middleware order, secret scan. Zero ship-blocking findings; 1 ⚠ deviation (no student SELECT on `courses` — acceptable; data exposed through downstream tables).

**Test counts:**
- api: 42 files, 180+ tests pass, 7 skipped, 0 failed
- web: 16 files, 40 tests pass, 0 failed
- shared: 9 files, all pass

**One new dep:** `hono-rate-limiter` on `apps/api`.

**Rulings I made during execution:**

1. **Task 2 / Step 6**: The plan said "Update the cycle 8a helper to import from shared." I made the import work, but the cycle 8a helper still re-exports `AuditAction` and `AuditEntity` (so existing call sites in 8a's audit emission don't break). Single source of truth lives in `shared`; the api helper is a thin re-export.

2. **Task 4 / users email extension**: When `c.env` is undefined (the unit test setup), the email merge would 500. Made the merge fault-tolerant: skip it when env is unset. In production with a real env, the merge runs as designed.

3. **Task 5-6 / rate limit bypass in tests**: The rate limit test would normally break the rest of the suite by exhausting the per-IP bucket across tests. Solved via `DISABLE_RATE_LIMIT=1` in the vitest config + lazy init of the rate limiter (so the env check is per-request, not at module load). The rate limit test files flip the env to "0" in a `beforeAll` to exercise the real middleware.

4. **Task 5-6 / mock default `count`**: The `makeAuditMockSupabase` helper was updated to support a `count` field. Default is `0` (NOT `data.length` — that broke the marks submit test, which expects `count: 0` for the precondition check). Tests that need a specific count set it explicitly via the per-table `tableResponses`.

5. **Task 7 / AuditLogPage test matcher**: `getByText(/marks/)` matched both the row data and the dropdown option. Switched to `getByText("m1")` (unique to the row) and `getByRole("button", { name: /apply/i })` (unique to the page).

**Follow-ups for cycle 8c (production deploy + monitoring + smoke test):**
- KV-backed rate limiting (replace the in-memory store; mentioned in the security review as a ⚠ limitation).
- Apply the cycle-8a `audit_log` migration to the production Supabase project.
- Wire `console.error("[audit_log] insert failed", ...)` to Cloudflare Workers logs / logpush.
- Run the end-to-end smoke test: login → attendance → marks → approve → lock → compile → publish → transcript download, with audit rows appearing for each step.
- Decide on `courses` student-SELECT policy (the ⚠ in the security review) — defer to a follow-up cycle unless a student "browse courses" UI is needed.

**Cycle 8b commit list (this run):**
```
5f9382a fix(web): drop unused auditLogListQuerySchema import in AuditLogPage
4625586 docs: cycle-8b security review report
31e7179 feat(web): admin audit-log page with filters, pagination, CSV download
969d79e feat(api): mount rate limits in middleware chain
8cded8c fix(test): use MiddlewareHandler<AppEnv> in rate limit test helper
ffd2213 feat(api): rate limiting middleware (general + bulk tighter)
89e054c fix(api): skip email merge when c.env unset (test mode)
68ae98c feat(api): admin users GET includes email from auth.users
7e89ada test(api): add id field to toCsv test row
2278a75 feat(api): admin audit-log list + CSV export endpoints
3fb633f feat(shared): audit-log zod schemas + move AuditAction/AuditEntity to shared
7303017 feat(api): service-role client helper for admin-only endpoints
```
