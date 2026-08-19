# Cycle 1 — Testing

## Unit tests (run by default)

```bash
pnpm test
```

Covers:

- `supabaseAuth` middleware (valid / invalid / missing / wrong-role)
- `requireRole` factory (allow / deny)
- `GET /api/admin/users` → 403 for non-admin
- `AuthContext` (signIn / signOut / state hydration)
- `ProtectedRoute` (loading / unauthenticated / wrong role)
- `AppShell` (role-aware nav)

No external services required.

## Integration tests (gated)

Real Supabase required. Run in this order:

```bash
pnpm db:start
pnpm db:reset
pnpm db:seed:test-users
```

Create `apps/web/.env` first if you haven't (copy `apps/web/.env.example`),
then export the values into your shell — `SUPABASE_SERVICE_ROLE_KEY` is
populated in the repo-root `.env` by Step 3 of `.docs/cycle-1-setup.md`:

```bash
set -a; source .env; set +a
```

Then:

```bash
SUPABASE_TEST_URL=http://127.0.0.1:54321 \
SUPABASE_TEST_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
pnpm test:integration
```

(Run `pnpm db:status` to get the URLs and keys.)

These tests cover:

- `admin.test`, `faculty.test`, `student.test` all sign in successfully
- Each gets the correct `app_metadata.role` from the auth hook

## RLS tests (gated)

Same env as integration, plus `SUPABASE_TEST_RLS=1`:

```bash
SUPABASE_TEST_URL=http://127.0.0.1:54321 \
SUPABASE_TEST_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
SUPABASE_TEST_RLS=1 \
pnpm test:rls
```

Covers:

- A student can read their own profile row
- A student cannot read another student's profile row
- A student cannot promote themselves to admin

## CI

CI runs `pnpm test`. Integration and RLS tests are skipped (no creds in
the CI env). Add secret env vars to the GitHub Actions workflow if you
want integration tests to run in CI.
