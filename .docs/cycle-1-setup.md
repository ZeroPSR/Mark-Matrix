# Cycle 1 — Operator Setup

## One-time setup

1. Install workspace dependencies (includes the Supabase CLI):

   ```bash
   pnpm install
   ```

2. Start a local Supabase instance:

   ```bash
   pnpm db:start
   ```

   Wait for the "API URL", "anon key", and "service_role key" lines. Copy them.

3. Create `.env` at the repo root (none ships by default):

   ```bash
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_ANON_KEY=<from pnpm db:status>
   SUPABASE_SERVICE_ROLE_KEY=<from pnpm db:status>
   ```

   Pull the values from `pnpm db:status` output, then either keep them in
   `.env` (the seed/check scripts auto-load it) or export into the shell:

   ```bash
   set -a; source .env; set +a
   ```

4. Create `apps/web/.env` from the example template (no file ships by default):

   ```bash
   cp apps/web/.env.example apps/web/.env
   ```

   Then edit `apps/web/.env`:

   ```bash
   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<from pnpm db:status>
   ```

5. Apply migrations:

   ```bash
   pnpm db:reset
   ```

   This applies the three migrations: `create_profiles`, `profiles_rls`, `auth_hook_role_claim`.

6. Seed the first admin:

   ```bash
   pnpm db:seed:admin
   ```

   Defaults to `admin@mark-matrix.local` / `changeme`. Override via env:

   ```bash
   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='strong-pw' pnpm db:seed:admin
   ```

7. **Change the admin password immediately** after first sign-in. The default is intentionally weak.

## Hosted (production / staging) Supabase

`supabase db push` runs only the three schema migrations. The admin
bootstrap is **not** a migration — it never runs automatically.

For hosted Supabase:

1. Push the schema:

   ```bash
   pnpm db:push
   ```

2. Set the env vars (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`) as Cloudflare Worker secrets.

3. Wire the auth hook in the dashboard:
   - Go to **Authentication → Hooks → Custom Access Token**.
   - Enable it.
   - Select `public.custom_access_token_hook` from the function dropdown.
   - Save.

4. Create the first admin manually via the Admin API (use the same Node
   script: `SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... pnpm db:seed:admin`).
   The script is idempotent.

## Daily workflow

```bash
pnpm db:start            # start local Supabase
pnpm db:stop             # stop it
pnpm db:status           # print connection info
pnpm db:reset            # nuke + reapply migrations + seed
pnpm db:push             # push schema to a remote (e.g. staging)
pnpm db:seed:admin       # bootstrap the first admin (idempotent)
pnpm db:seed:test-users  # create 3 test users (idempotent)
```
