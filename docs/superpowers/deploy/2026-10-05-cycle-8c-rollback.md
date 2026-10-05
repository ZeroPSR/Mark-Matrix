# Cycle 8c Rollback Plan

**Date:** 2026-10-05
**Scope:** Roll back the production deployment of Mark-Matrix.

Three scenarios, in increasing severity.

## Scenario 1: API-only rollback (most common)

The API is serverless and stateless. Supabase is the source of truth, so a Worker rollback has no data impact.

```bash
# Sub-second rollback to the previous deploy.
wrangler rollback --name mark-matrix-api
```

Verify:
```bash
curl -I https://api.mark-matrix.example.com/health
# Expected: 200 OK
```

## Scenario 2: DB-only rollback

The 17 migrations are additive; none drop a column or table. If a migration introduced a problem (none in the current set), the rollback is a new migration that undoes the change.

**Never run `supabase db reset` in production** — that drops the entire database.

If the cycle-8a `audit_log` table is the problem (extremely unlikely; it's append-only), the rollback migration is:

```sql
drop table if exists public.audit_log;
```

**Warning:** This is irreversible. All audit history is lost. Prefer rolling back the API first (Scenario 1).

## Scenario 3: Full rollback

Estimated 30-60 minutes, mostly waiting on Cloudflare deploys.

```bash
# 1. Rollback the API.
wrangler rollback --name mark-matrix-api

# 2. (If needed) Apply a rollback migration.
# See Scenario 2. Skip this if rolling back the API alone is enough.

# 3. (If needed) Roll back secrets.
# Note: Cloudflare doesn't support deleting a secret — only overwriting.
# To "delete" a secret, set it to an empty string (which is still readable).
wrangler secret put SUPABASE_URL -- < /dev/null
# ...repeat for each secret...

# 4. Verify with the smoke test.
# Open the frontend, click through the 12 steps in
# `2026-10-05-cycle-8c-smoke-test.md`.
```

## Monitoring during rollback

- Cloudflare Workers Analytics: dashboards update in near real time.
- Logpush: log lines flow to your destination.
- Supabase: query metrics, connection counts, and row changes visible in the dashboard.
