# Cycle 2 — Testing Runbook

## Ungated unit / handler tests

```bash
pnpm install
pnpm --filter @mark-matrix/shared test
pnpm --filter @mark-matrix/api test
pnpm --filter @mark-matrix/web test
```

Expected: all tests pass; the rls.academic and rls.profiles test files are
skipped without credentials.

## Gated RLS integration tests

Against a local Supabase:

```bash
pnpm db:reset
pnpm db:seed:test-users

export SUPABASE_TEST_URL=http://127.0.0.1:54321
export SUPABASE_TEST_SERVICE_ROLE_KEY=$(supabase status --output env | grep SERVICE_ROLE_KEY | cut -d= -f2)
export SUPABASE_TEST_RLS=1
pnpm --filter @mark-matrix/api test rls.academic
pnpm --filter @mark-matrix/api test rls.profiles
```

Expected: all 8 cycle-2 scenarios + 4 cycle-1 scenarios pass.

## Manual smoke (local)

1. `pnpm db:reset && pnpm db:seed:admin`
2. `pnpm dev` — API on 8787, web on 5173.
3. Sign in as `admin@mark-matrix.local` (default password `changeme`).
4. Promote `student.test` to faculty (Users page), create a faculty profile
   for them, then create a course, then assign them to it. Sign in as
   `faculty.test` and confirm the course appears in `/faculty/courses`.
5. Upload a CSV with three rows (one valid, one unknown roll, one duplicate)
   to the enrollments page and confirm the per-row report.