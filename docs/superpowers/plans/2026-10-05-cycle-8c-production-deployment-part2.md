# Cycle 8c — Production Deployment + Monitoring + Smoke Test (Implementation Plan, Part 2)

**Plan files:**
- [Part 1: Tasks 1–3 — wrangler configs, KV rate limit, docs](./2026-10-05-cycle-8c-production-deployment-part1.md)
- [Part 2 (this file): Tasks 4–5 — user-driven deploy + smoke test, final pass](./2026-10-05-cycle-8c-production-deployment-part2.md)

**Spec:** [docs/superpowers/specs/2026-10-05-cycle-8c-production-deployment-design.md](../specs/2026-10-05-cycle-8c-production-deployment-design.md)

**Important:** Tasks 4 and 5 are user-driven — they require production credentials and manual clicks. The plan provides the exact commands. **I will pause before each irreversible action** (`supabase link`, `supabase db push`, `wrangler secret put`, `wrangler deploy`, `wrangler pages deploy`) to get your explicit yes.

---

## Task 4: User-driven deploy — link, migrate, secrets, deploy

**Files:** none (operations only; runs from your terminal, not the repo).

**Interfaces:**
- Consumes: prod credentials (Supabase project ref, anon key, service-role key; Cloudflare account ID, API token, custom domain).
- Produces: a deployed, runnable production stack.

This task is broken into discrete steps. After each step, the plan pauses for your confirmation before the next.

### 4.1: Link the Supabase CLI to the prod project

- [ ] **Step 1: Authenticate the Supabase CLI (if not already)**

```bash
supabase login
```

You'll be prompted to log in via the browser. This persists a token on this machine.

- [ ] **Step 2: Link to the prod project**

```bash
# Replace <prod-project-ref> with the actual project ref from the Supabase dashboard.
# It looks like "abcdefghij" — a 12-character identifier in the URL.
supabase link --project-ref <prod-project-ref>
```

Expected: prints "Finished supabase link."

**Pause:** confirm the link succeeded before proceeding.

### 4.2: Apply all migrations

- [ ] **Step 3: Push all migrations**

```bash
supabase db push --include-all
```

Expected output (abbreviated):
```
Applying migration 20260818100000_create_profiles.sql...
Applying migration 20260818100001_profiles_rls.sql...
...
Applying migration 20261001000000_audit_log.sql...
Finished supabase db push.
```

If the command fails partway (e.g., one migration errors), the migrations before the failing one are applied; migrations from the failing one onward are not. To recover, re-run `supabase db push --include-all` — the migrations are idempotent (`create table if not exists`, `create or replace function`, etc.), so re-running is safe.

**Pause:** confirm the push completed (or was already applied). The Supabase dashboard's Table Editor should show all 18 tables (including `audit_log`).

### 4.3: Create the KV namespace

- [ ] **Step 4: Create the KV namespace for rate limiting**

```bash
wrangler kv:namespace create RATE_LIMIT
```

Expected output:
```
{ binding = "RATE_LIMIT", id = "<namespace-id>" }
```

Copy the `id` value and update `apps/api/wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  { "binding": "RATE_LIMIT", "id": "<paste-the-id-here>" }
]
```

- [ ] **Step 5: Commit the updated wrangler config**

```bash
git add apps/api/wrangler.jsonc
git commit -m "chore: bind KV namespace ID for production rate limit

Cycle 8c. The id from 'wrangler kv:namespace create RATE_LIMIT' is
pasted into the kv_namespaces block.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### 4.4: Set secrets

- [ ] **Step 6: Set the API secrets**

For each of the three secrets:

```bash
wrangler secret put SUPABASE_URL
# Enter: https://<prod-project-ref>.supabase.co

wrangler secret put SUPABASE_ANON_KEY
# Enter: <the anon key from the Supabase dashboard's API settings>

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Enter: <the service-role key from the Supabase dashboard's API settings>
```

Expected: each prints "✨ Successfully created secret."

**Pause:** confirm all three secrets are set. `wrangler secret list` should show them.

### 4.5: Deploy the API

- [ ] **Step 7: Deploy the API**

```bash
wrangler deploy
```

Expected output (abbreviated):
```
Total Upload: 47.XX KiB / gzip: 14.XX KiB
Worker Startup Time: 30ms
Uploaded mark-matrix-api (X.XX sec)
Published mark-matrix-api (X.XX sec)
  https://mark-matrix-api.<your-account>.workers.dev
```

**Pause:** confirm the deploy succeeded. The URL printed is the `*.workers.dev` fallback if you didn't set up a custom domain in `wrangler.jsonc`.

- [ ] **Step 8: Smoke-test the API health endpoint**

```bash
# If you set up a custom domain:
curl -I https://api.mark-matrix.example.com/health
# Or the workers.dev URL:
curl -I https://mark-matrix-api.<your-account>.workers.dev/health
```

Expected: `HTTP/2 200`.

### 4.6: Build and deploy the frontend

- [ ] **Step 9: Build the frontend**

```bash
pnpm --filter @mark-matrix/web build
```

Expected: build completes, output in `apps/web/dist/`.

- [ ] **Step 10: Deploy to Cloudflare Pages**

```bash
# Replace <your-account> with your Cloudflare account subdomain if using workers.dev.
# If using a custom domain, set up the custom domain in the Cloudflare Pages
# dashboard first, then deploy.
wrangler pages deploy ./apps/web/dist --project-name mark-matrix-web
```

Expected output (abbreviated):
```
🌎  Uploading... (X.XX KiB)
✨ Success! Uploaded XX files (X.XX sec)
Published https://<commit-hash>.mark-matrix-web.pages.dev
```

**Pause:** confirm the deploy succeeded. The `*.pages.dev` URL is the production URL.

- [ ] **Step 11: Bind the custom domain (if applicable)**

If you have a custom domain (`mark-matrix.example.com`), configure it in the Cloudflare Pages dashboard:
- Workers & Pages → mark-matrix-web → Custom domains → Set up a custom domain.

### 4.7: Verify the deployment

- [ ] **Step 12: Open the deployed URL in a browser**

The URL is the `*.pages.dev` from Step 10 (or your custom domain if configured).

Expected: HTTPS, no console errors, the login page loads.

**If the page fails to load:** check the browser dev tools network tab. Common issues:
- CORS error: the API's `ALLOWED_ORIGINS` list in `apps/api/src/index.ts` doesn't include your frontend origin. Update it and redeploy the API.
- 404 on the API: `VITE_API_ORIGIN` in the frontend's wrangler config doesn't match the API's actual URL. Update and redeploy the frontend.

**Pause:** confirm the frontend loads. Now run the smoke test.

---

## Task 5: User-driven smoke test

**Files:** none (manual run; uses the deployed app and the smoke-test doc).

**Interfaces:**
- Consumes: the deployed production app + the smoke-test doc at `docs/superpowers/deploy/2026-10-05-cycle-8c-smoke-test.md`.
- Produces: a verified production deployment (or a rollback trigger).

- [ ] **Step 1: Open the smoke-test doc**

```bash
# (Read it in your editor or print to terminal.)
cat docs/superpowers/deploy/2026-10-05-cycle-8c-smoke-test.md
```

- [ ] **Step 2: Run all 12 steps**

Click through the 12 manual steps in the doc, checking off each one. The doc has pass criteria for each step.

**If any step fails:** stop. Do not check the next box. See the rollback plan at `docs/superpowers/deploy/2026-10-05-cycle-8c-rollback.md` (Scenario 1: API-only rollback is the most common).

- [ ] **Step 3: Mark the smoke-test result**

If all 12 steps passed:
- Edit `docs/superpowers/deploy/2026-10-05-cycle-8c-smoke-test.md` and add a line at the top: `**Smoke test result:** PASS on YYYY-MM-DD HH:MM`.
- Commit:

```bash
git add docs/superpowers/deploy/2026-10-05-cycle-8c-smoke-test.md
git commit -m "docs: cycle-8c smoke test PASS

Cycle 8c. All 12 manual steps verified on production:
- Login, attendance, marks, approve, lock, compile, publish,
  transcript, rate limit, 403.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

If any step failed:
- Mark the failing step in the doc.
- Trigger Scenario 1 (API rollback) or Scenario 3 (full rollback) per the rollback doc.
- Do not commit a partial smoke-test result.

**Pause:** confirm the smoke test result (pass or fail) before proceeding to Task 6.

---

## Task 6: Final pass — typecheck, lint, retro

**Files:**
- Create: `docs/superpowers/plans/2026-10-05-cycle-8c-retro.md`

- [ ] **Step 1: Run the full test suite (regression check)**

```bash
pnpm test
```
Expected: 67 files pass + 7 skipped + 0 failed (same as cycle 8b end-state). The KV rate limit middleware change should not have broken anything.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```
Expected: clean.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```
Expected: clean (only pre-existing warnings).

- [ ] **Step 4: Write the cycle-8c retro**

Create `docs/superpowers/plans/2026-10-05-cycle-8c-retro.md` with the following content:

```markdown
# Cycle 8c — Production Deployment + Monitoring + Smoke Test (Retro)

**Date:** YYYY-MM-DD
**Status:** Complete (assuming the smoke test passed).

## What shipped
- Cloudflare Workers config for the API with KV rate-limit binding, custom domain, observability, logpush.
- Cloudflare Pages config for the frontend with `VITE_API_ORIGIN` baked into the build.
- All 17 migrations applied to the production Supabase project.
- KV-backed rate limit (cycle 8b follow-up) with in-memory fallback.
- Three deployment docs: secrets, rollback, smoke test.
- Production smoke test passed.

## Follow-ups
- Real-time audit-log streaming (deferred).
- Audit-log retention policy (deferred).
- Custom email alerts for high-risk actions (deferred).

## Cycle 8 trilogy summary
- 8a: Audit logging foundation (audit_log table, recordAudit helper, 22 instrumented write paths).
- 8b: Security hardening + admin audit-log UI (rate limit, RLS review, audit log browse/export).
- 8c: Production deployment + monitoring + smoke test (this cycle).
```

- [ ] **Step 5: Final commit**

```bash
git add docs/superpowers/plans/2026-10-05-cycle-8c-retro.md
git commit -m "docs: cycle-8c retro

Cycle 8c complete. Production deployment done; smoke test passed.
Cycle 8 trilogy (8a + 8b + 8c) is now complete.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

- [ ] **Step 6: Report completion**

The cycle 8 trilogy is complete. All three cycles (8a, 8b, 8c) are done. The user can now:
- Push all the local main commits to origin/main.
- Begin using Mark-Matrix in production.

---

**End of plan.**
