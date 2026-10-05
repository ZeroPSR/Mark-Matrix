# Cycle 8c Secrets

**Date:** 2026-10-05
**Purpose:** List every env var the project uses in production. **No actual values are stored here.**

| Name | Side | Sensitive | How to set | Description |
|---|---|---|---|---|
| `SUPABASE_URL` | API | yes | `wrangler secret put` | Production Supabase project URL |
| `SUPABASE_ANON_KEY` | API | yes | `wrangler secret put` | Anon key (RLS-bound clients use this) |
| `SUPABASE_SERVICE_ROLE_KEY` | API | yes | `wrangler secret put` | Service-role key (admin-only enrichment in `/api/admin/users`) |
| `RATE_LIMIT_BACKEND` | API | no | `wrangler secret put` or `vars` in `wrangler.jsonc` | `kv` (default) or `memory` |
| `LOGPUSH_TOKEN` | API | yes (if your destination needs one) | `wrangler secret put` | Logpush destination token (Datadog, S3, etc.) |
| `ENVIRONMENT` | API | no | `vars` in `wrangler.jsonc` (committed) | `production` |
| `VITE_API_ORIGIN` | Web | no | `vars` in `wrangler.jsonc` (committed) | API base URL baked into the build |

**How to set a secret:**

```bash
# From a trusted machine, with wrangler authenticated:
wrangler secret put SUPABASE_URL
# You'll be prompted to enter the value.

# Or pipe it in (less secure — value appears in process list briefly):
echo "https://your-prod.supabase.co" | wrangler secret put SUPABASE_URL
```

**Where secrets are stored:**

- Cloudflare's secret store, surfaced to the Worker as `c.env.SUPABASE_URL` etc.
- Never in `wrangler.jsonc`.
- Never in this repo.
- Never in the React bundle (verified by the cycle 8b secret scan).
