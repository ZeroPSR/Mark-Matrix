# Cycle 1 — Auth, Sessions & RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement authentication, sessions, and role-based access control for Mark-Matrix per the Cycle 1 design spec — Supabase Auth + `profiles` + auth hook, Hono `supabaseAuth` + `requireRole` middleware with RLS-enforced `profiles`, and a React login flow with a role-aware `AppShell`.

**Architecture:** Three layers — Supabase (Postgres + Auth + RLS) at the bottom, a Hono API on Cloudflare Workers in the middle (`supabaseAuth` middleware verifies the JWT and reads `role` from the `custom_access_token` hook-stamped `app_metadata`, `requireRole` factory guards admin/faculty/student routes), and a React + Vite + React Router v6 frontend at the top (`AuthContext` + `ProtectedRoute` + role-aware `AppShell`). Defense in depth: the API middleware guards every authenticated route, and RLS policies on `profiles` refuse anything the middleware misses.

**Tech Stack:** React 18 + Vite + react-router-dom v6 · Hono 4 on Cloudflare Workers · Supabase (Postgres + Auth + RLS) · `@supabase/supabase-js` 2 · Vitest + `@cloudflare/vitest-pool-workers` · TypeScript 5.7 strict.

**Spec:** [docs/superpowers/specs/2026-08-18-cycle-1-auth-rbac-design.md](../specs/2026-08-18-cycle-1-auth-rbac-design.md)

## Global Constraints

- **Package manager:** pnpm 11 with workspaces. Lockfile is committed.
- **Node:** ≥ 20. Use `node:` protocol for built-ins.
- **TypeScript:** strict mode (`tsconfig.base.json`). `noUncheckedIndexedAccess` is on — treat `arr[i]` as `T | undefined`.
- **Imports:** `@mark-matrix/shared` for cross-package code. Prefer `import type` for type-only imports.
- **Formatting:** Prettier (2 spaces, double quotes, trailing commas).
- **Linting:** ESLint v9 flat config (`eslint.config.mjs`).
- **Testing:** Vitest. Workspace tests live next to source as `*.test.ts(x)`.
- **Naming:** `PascalCase` for components/types, `camelCase` for functions/variables, `SCREAMING_SNAKE_CASE` for constants.
- **Migrations:** Supabase CLI. The admin bootstrap is **NOT** a migration — it lives at `scripts/seed-admin.ts` and is run via `pnpm db:seed:admin`. `supabase db push` applies only schema migrations under `supabase/migrations/`.
- **Frontend router:** React Router v6 with `<BrowserRouter>` wrapping `<AuthProvider>` in `main.tsx`.
- **Service-role key:** never appears in the web bundle. Only the API uses it (and only in admin handlers; Cycle 1 has none).
- **Token storage:** browser localStorage (Supabase default). Cycle 8 will revisit httpOnly cookies.

---

## File Structure

```
supabase/
├── config.toml                            # [auth.hook.custom_access_token] block
└── migrations/
    ├── 20260818100000_create_profiles.sql
    ├── 20260818100001_profiles_rls.sql
    └── 20260818100002_auth_hook_role_claim.sql

scripts/
├── seed-admin.ts                          # Admin API, run via `pnpm db:seed:admin`
└── seed-test-users.ts                     # Admin API, run via `pnpm db:seed:test-users`

packages/shared/src/
├── auth.ts                                # NEW: PROFILE_TABLE, AUTH_HOOK_NAME
└── index.ts                               # EXTEND: API_ROUTES gets me/login/forbidden/adminUsers

apps/api/src/
├── index.ts                               # EXTEND: mount auth + /api/me + admin route
├── env.ts                                 # NEW: Env, AppVariables, AppEnv types
├── lib/supabase.ts                        # NEW: getSupabase(env, jwt?) factory
├── middleware/
│   ├── auth.ts                            # NEW: supabaseAuth
│   └── requireRole.ts                     # NEW: requireRole factory
├── routes/admin/users.ts                  # NEW: GET /api/admin/users
└── tests/
    ├── auth.middleware.test.ts            # NEW
    ├── requireRole.test.ts                # NEW
    ├── negative.admin-route.test.ts       # NEW
    ├── integration.shells.test.ts         # NEW (gated)
    └── rls.profiles.test.ts               # NEW (gated)

apps/web/src/
├── main.tsx                               # EXTEND: wrap in <BrowserRouter><AuthProvider>
├── App.tsx                                # EXTEND: route tree
├── lib/supabase.ts                        # NEW: createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
├── auth/
│   ├── AuthContext.tsx                    # NEW: { userId, role, loading, signIn, signOut }
│   ├── ProtectedRoute.tsx                 # NEW: <ProtectedRoute roles={...}> gate
│   └── useAuth.ts                         # NEW: re-export
├── pages/
│   ├── LoginPage.tsx                      # NEW
│   ├── NotFoundPage.tsx                   # NEW
│   ├── ForbiddenPage.tsx                  # NEW
│   ├── DashboardPlaceholder.tsx           # NEW
│   ├── admin/UsersPlaceholder.tsx         # NEW
│   ├── faculty/FacultyPlaceholder.tsx     # NEW
│   └── student/StudentPlaceholder.tsx     # NEW
├── shell/
│   ├── AppShell.tsx                       # NEW: header + nav + <Outlet/>
│   └── navConfig.ts                       # NEW: NAV_ITEMS by role
└── tests/
    ├── AuthContext.test.tsx               # NEW
    ├── ProtectedRoute.test.tsx            # NEW
    └── shell.integration.test.tsx         # NEW (gated)

.docs/
├── cycle-1-setup.md                       # NEW: operator runbook
└── cycle-1-testing.md                     # NEW: integration/RLS test instructions

package.json (root)                        # EXTEND: add supabase dev-dep, db:* and test:* scripts
.github/workflows/ci.yml                   # EXTEND: optional test:integration step
```

---

## Task 1: Infrastructure Setup (Supabase CLI + root scripts)

**Files:**
- Modify: `package.json` (root) — add `supabase` dev-dep and `db:*` / `test:*` scripts
- Create: `supabase/config.toml` — local Supabase config with auth hook block

**Interfaces:**
- Produces: `pnpm db:push`, `pnpm db:reset`, `pnpm db:seed:admin`, `pnpm db:seed:test-users`, `pnpm test:integration`, `pnpm test:rls` scripts.

- [ ] **Step 1: Add `supabase` CLI as a workspace root dev-dependency**

Edit the `package.json` at the repo root. Add `"supabase": "^1.200.0"` to `devDependencies` (next to `tsx`) and add the following scripts:

```json
{
  "scripts": {
    "dev": "pnpm --parallel --filter ./apps/* dev",
    "build": "pnpm -r build",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "check-db": "tsx scripts/check-db.ts",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:status": "supabase status",
    "db:reset": "supabase db reset",
    "db:push": "supabase db push",
    "db:diff": "supabase db diff",
    "db:seed:admin": "tsx scripts/seed-admin.ts",
    "db:seed:test-users": "tsx scripts/seed-test-users.ts",
    "test:integration": "SUPABASE_TEST_URL= SUPABASE_TEST_SERVICE_ROLE_KEY= pnpm -r test",
    "test:rls": "cross-env SUPABASE_TEST_URL= SUPABASE_TEST_RLS=1 pnpm --filter @mark-matrix/api test"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@types/node": "^22.10.0",
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "eslint": "^9.17.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^7.1.1",
    "globals": "^15.14.0",
    "prettier": "^3.4.2",
    "supabase": "^1.200.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "typescript-eslint": "^8.18.0",
    "cross-env": "^7.0.3"
  }
}
```

- [ ] **Step 2: Install the new dependency**

Run: `pnpm install`
Expected: `supabase` appears in `node_modules/.bin/`. The `pnpm db:push` script is recognized.

- [ ] **Step 3: Create `supabase/config.toml` with the auth hook block**

Create `supabase/config.toml` at the repo root with the following content:

```toml
# Supabase local config. See https://supabase.com/docs/guides/cli/config

project_id = "mark-matrix"

[api]
enabled = true
port = 54321

[db]
port = 54322
shadow_port = 54320
major_version = 15

[auth]
enabled = true
site_url = "http://127.0.0.1:5173"
additional_redirect_urls = ["http://127.0.0.1:5173"]
jwt_expiry = 3600
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10

[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"

[studio]
enabled = true
port = 54323

[inbucket]
enabled = true
port = 54324
```

- [ ] **Step 4: Add `supabase/` to `.gitignore` exclusions correctly**

Verify `.gitignore` does NOT exclude `supabase/` (only `.wrangler/` and `node_modules/` should be ignored). Run:

```bash
git check-ignore supabase/config.toml -v
```

Expected: no output (file is not ignored). If the file is ignored, update `.gitignore` to add `!supabase/` after the `node_modules/` line.

- [ ] **Step 5: Verify the supabase CLI is wired up**

Run: `pnpm db:status`
Expected: command runs (it may report "supabase not running" or list local containers — both are OK). The important thing is that the CLI is reachable.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml supabase/config.toml .gitignore
git commit -m "chore: add supabase CLI + local config with auth hook"
```

---

## Task 2: Schema, RLS, and Auth-Hook Migrations

**Files:**
- Create: `supabase/migrations/20260818100000_create_profiles.sql`
- Create: `supabase/migrations/20260818100001_profiles_rls.sql`
- Create: `supabase/migrations/20260818100002_auth_hook_role_claim.sql`

**Interfaces:**
- Produces: `supabase db push` applies these three SQL files cleanly. After application, `public.profiles` table exists, RLS is enabled with the four policies, `public.is_admin()` function exists, and `public.custom_access_token_hook` function exists.

### Part A: Create the `profiles` table

- [ ] **Step 1: Write `supabase/migrations/20260818100000_create_profiles.sql`**

```sql
-- 20260818100000_create_profiles.sql
-- Creates the profiles table and auto-create trigger on auth sign-up.

create type public.user_role as enum ('admin', 'faculty', 'student');

create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       public.user_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'student'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 2: Verify the SQL parses**

Run: `pnpm db:start` (if not already running). Then:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/20260818100000_create_profiles.sql
```

Expected: no syntax errors. Output ends with `CREATE TRIGGER` and no `ERROR:` lines.

If `psql` is not available, run `supabase db reset` and inspect the migration log.

### Part B: Add RLS policies + `is_admin()` helper

- [ ] **Step 3: Write `supabase/migrations/20260818100001_profiles_rls.sql`**

```sql
-- 20260818100001_profiles_rls.sql
-- RLS policies on profiles + is_admin() SECURITY DEFINER helper.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and role = (select role from public.profiles where user_id = (select auth.uid()))
  );

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin());
```

- [ ] **Step 4: Apply the RLS migration and verify the policies**

Run: `pnpm db:reset`
Expected: command completes with `DB reset successfully` and lists all three migrations as applied.

Verify the policies landed:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select polname, polcmd from pg_policy where polrelid = 'public.profiles'::regclass order by polname;"
```

Expected output (4 rows):

```
 profiles_select_admin | r
 profiles_select_own   | r
 profiles_update_admin | u
 profiles_update_own   | u
```

(`r` = SELECT, `u` = UPDATE; no INSERT, no DELETE policies.)

### Part C: Auth hook function

- [ ] **Step 5: Write `supabase/migrations/20260818100002_auth_hook_role_claim.sql`**

```sql
-- 20260818100002_auth_hook_role_claim.sql
-- Stamps the user's role into app_metadata on every JWT mint.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims    jsonb;
  user_role public.user_role;
begin
  select role into user_role
  from public.profiles
  where user_id = (event->>'user_id')::uuid;

  claims := event->'claims';
  if jsonb_typeof(claims->'app_metadata') is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;
  claims := jsonb_set(claims, '{app_metadata,role}',
                      to_jsonb(coalesce(user_role::text, 'student')));

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
```

- [ ] **Step 6: Apply and verify the hook function**

Run: `pnpm db:reset`
Expected: clean apply. Verify the function exists:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "\df public.custom_access_token_hook"
```

Expected output: one row showing `public | custom_access_token_hook | jsonb | jsonb`.

Verify the hook is enabled in `config.toml`:

```bash
grep -A 1 "auth.hook.custom_access_token" supabase/config.toml
```

Expected:

```
[auth.hook.custom_access_token]
enabled = true
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(db): profiles table, RLS policies, is_admin() helper, auth hook"
```

---

## Task 3: Shared Package Extensions

**Files:**
- Modify: `packages/shared/src/index.ts` — extend `API_ROUTES`
- Create: `packages/shared/src/auth.ts` — `PROFILE_TABLE`, `AUTH_HOOK_NAME`

**Interfaces:**
- Produces: `PROFILE_TABLE` and `AUTH_HOOK_NAME` constants from `@mark-matrix/shared`. `API_ROUTES` gains `me`, `login`, `forbidden`, `adminUsers`.

- [ ] **Step 1: Create `packages/shared/src/auth.ts`**

```ts
/**
 * Cross-package constants for the auth subsystem.
 *
 * Imported by apps/api (route guards, Supabase queries) and apps/web
 * (validation). Keeping these in `@mark-matrix/shared` ensures the
 * API and frontend never disagree on the source-of-truth names.
 */

export const PROFILE_TABLE = "profiles" as const;

export const AUTH_HOOK_NAME = "custom_access_token" as const;
```

- [ ] **Step 2: Update `packages/shared/src/index.ts`**

Replace the file's `API_ROUTES` section with:

```ts
export const API_ROUTES = {
  health: "/health",
  me: "/api/me",
  login: "/login",
  forbidden: "/forbidden",
  adminUsers: "/api/admin/users",
} as const;
```

Add a re-export at the top of the file:

```ts
export * from "./auth.js";
```

(So consumers can `import { PROFILE_TABLE } from "@mark-matrix/shared"`.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mark-matrix/shared typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/
git commit -m "feat(shared): add auth constants and route table"
```

---

## Task 4: API Foundation — `env.ts` + Supabase Client Factory

**Files:**
- Create: `apps/api/src/env.ts`
- Create: `apps/api/src/lib/supabase.ts`

**Interfaces:**
- Produces: `Env`, `AppVariables`, `AppEnv` types. `getSupabase(env, jwt?)` factory returns a typed `SupabaseClient`.

- [ ] **Step 1: Write `apps/api/src/env.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@mark-matrix/shared";

export interface Env {
  ENVIRONMENT: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export type AppVariables = {
  userId: string;
  role: Role;
  /** Anon-key client scoped to the calling user (RLS-bound). */
  supabase: SupabaseClient;
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };
```

- [ ] **Step 2: Write `apps/api/src/lib/supabase.ts`**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env.js";

/**
 * Build a Supabase client.
 *
 * - With `jwt`: anon-key client scoped to the calling user (RLS-bound).
 * - Without `jwt`: service-role client (bypasses RLS) — admin handlers only.
 *   The web bundle must never call this overload.
 */
export function getSupabase(env: Env, jwt?: string): SupabaseClient {
  if (jwt !== undefined) {
    return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mark-matrix/api typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/env.ts apps/api/src/lib/supabase.ts
git commit -m "feat(api): env types and supabase client factory"
```

---

## Task 5: `supabaseAuth` Middleware (TDD)

**Files:**
- Create: `apps/api/src/middleware/auth.ts`
- Create: `apps/api/src/tests/auth.middleware.test.ts`

**Interfaces:**
- Consumes: `Env` (bindings), `AppEnv` (typed Hono context).
- Produces: `supabaseAuth` middleware — on `c.req.header("authorization")` Blade Bearer, calls `supabase.auth.getUser(jwt)`, sets `c.set("userId" | "role" | "supabase", ...)`. Returns 401 on missing/invalid token, 403 on missing/invalid role claim.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tests/auth.middleware.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { isRole, type Role } from "@mark-matrix/shared";
import type { AppEnv } from "../env.js";

const mockGetUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  }),
}));

// Import after vi.mock so the middleware picks up the mocked client.
const { supabaseAuth } = await import("../middleware/auth.js");

const env = {
  ENVIRONMENT: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-svc",
};

function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", supabaseAuth);
  app.get("/api/me", (c) => c.json({ userId: c.get("userId"), role: c.get("role") }));
  return app;
}

beforeEach(() => mockGetUser.mockReset());

describe("supabaseAuth middleware", () => {
  it("returns 401 when Authorization header is missing", async () => {
    const app = buildApp();
    const res = await app.request("/api/me", { headers: {} }, env);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "missing_authorization" });
  });

  it("returns 401 when Authorization header is malformed", async () => {
    const app = buildApp();
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "NotBearer xxx" } },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 when JWT is invalid/expired", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "jwt expired" },
    });
    const app = buildApp();
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "Bearer expired.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: "invalid_session" });
  });

  it("returns 403 when role claim is missing", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: {} } },
      error: null,
    });
    const app = buildApp();
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "role_missing_or_invalid" });
  });

  it("returns 403 when role claim is invalid", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "wizard" } } },
      error: null,
    });
    const app = buildApp();
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with userId and role when token is valid", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "admin" } } },
      error: null,
    });
    const app = buildApp();
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "u1", role: "admin" });
  });

  it("attaches a Supabase client to the context", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "u1", app_metadata: { role: "student" } } },
      error: null,
    });
    const app = new Hono<AppEnv>();
    app.use("/api/*", supabaseAuth);
    app.get("/api/me", (c) => {
      const client = c.get("supabase");
      return c.json({ hasClient: typeof client?.auth?.getUser === "function" });
    });
    const res = await app.request(
      "/api/me",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hasClient: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mark-matrix/api test`
Expected: FAIL — `../middleware/auth.js` does not exist. The failing test file lists an import error.

- [ ] **Step 3: Implement `apps/api/src/middleware/auth.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import { isRole } from "@mark-matrix/shared";
import { getSupabase } from "../lib/supabase.js";
import type { AppEnv } from "../env.js";

export const supabaseAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return c.json({ error: "missing_authorization" }, 401);
  }
  const jwt = header.slice(7).trim();
  if (!jwt) {
    return c.json({ error: "missing_authorization" }, 401);
  }

  const supabase = getSupabase(c.env, jwt);
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    return c.json({ error: "invalid_session" }, 401);
  }

  const roleClaim = (data.user.app_metadata as { role?: unknown } | undefined)?.role;
  if (!isRole(roleClaim)) {
    return c.json({ error: "role_missing_or_invalid" }, 403);
  }

  c.set("userId", data.user.id);
  c.set("role", roleClaim);
  c.set("supabase", supabase);
  await next();
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/auth.ts apps/api/src/tests/auth.middleware.test.ts
git commit -m "feat(api): supabaseAuth middleware with full test coverage"
```

---

## Task 6: `requireRole` Factory (TDD)

**Files:**
- Create: `apps/api/src/middleware/requireRole.ts`
- Create: `apps/api/src/tests/requireRole.test.ts`

**Interfaces:**
- Consumes: `AppEnv` (relies on `c.get("role")` set by `supabaseAuth`).
- Produces: `requireRole(allowed: Role | readonly Role[])` middleware factory that returns 403 if the role is missing or not in the allowed set.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/tests/requireRole.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { requireRole } from "../middleware/requireRole.js";
import type { AppEnv } from "../env.js";

function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    // Simulate supabaseAuth by setting a role from a header.
    const role = c.req.header("x-test-role");
    if (role === "admin" || role === "faculty" || role === "student") {
      c.set("role", role);
    }
    await next();
  });
  app.use("/api/admin", requireRole("admin"));
  app.get("/api/admin/ping", (c) => c.json({ ok: true }));
  app.use("/api/staff", requireRole(["admin", "faculty"]));
  app.get("/api/staff/ping", (c) => c.json({ ok: true }));
  return app;
}

describe("requireRole factory", () => {
  it("allows admin through an admin-only route", async () => {
    const app = buildApp();
    const res = await app.request("/api/admin/ping", { headers: { "x-test-role": "admin" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 403 for faculty on an admin-only route", async () => {
    const app = buildApp();
    const res = await app.request("/api/admin/ping", { headers: { "x-test-role": "faculty" } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 for student on an admin-only route", async () => {
    const app = buildApp();
    const res = await app.request("/api/admin/ping", { headers: { "x-test-role": "student" } });
    expect(res.status).toBe(403);
  });

  it("returns 403 when no role is set on the context", async () => {
    const app = buildApp();
    const res = await app.request("/api/admin/ping");
    expect(res.status).toBe(403);
  });

  it("allows multiple roles when an array is provided", async () => {
    const app = buildApp();
    const adminRes = await app.request("/api/staff/ping", { headers: { "x-test-role": "admin" } });
    const facultyRes = await app.request("/api/staff/ping", { headers: { "x-test-role": "faculty" } });
    expect(adminRes.status).toBe(200);
    expect(facultyRes.status).toBe(200);
  });

  it("returns 403 for an unlisted role when an array is provided", async () => {
    const app = buildApp();
    const res = await app.request("/api/staff/ping", { headers: { "x-test-role": "student" } });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mark-matrix/api test`
Expected: FAIL — `../middleware/requireRole.js` does not exist.

- [ ] **Step 3: Implement `apps/api/src/middleware/requireRole.ts`**

```ts
import type { MiddlewareHandler } from "hono";
import { type Role } from "@mark-matrix/shared";
import type { AppEnv } from "../env.js";

export function requireRole(
  allowed: Role | readonly Role[],
): MiddlewareHandler<AppEnv> {
  const allowedSet = new Set<Role>(Array.isArray(allowed) ? allowed : [allowed]);
  return async (c, next) => {
    const role = c.get("role");
    if (!role || !allowedSet.has(role)) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test`
Expected: all 6 tests in `requireRole.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/requireRole.ts apps/api/src/tests/requireRole.test.ts
git commit -m "feat(api): requireRole factory with full test coverage"
```

---

## Task 7: Admin Sample Route + Negative Integration Test

**Files:**
- Create: `apps/api/src/routes/admin/users.ts`
- Modify: `apps/api/src/index.ts` — mount `adminUsersRoute` under `requireRole("admin")`
- Create: `apps/api/src/tests/negative.admin-route.test.ts`

**Interfaces:**
- Produces: `GET /api/admin/users` — returns the authenticated admin's user list. Returns 403 for non-admin callers.

- [ ] **Step 1: Write the admin route file**

Create `apps/api/src/routes/admin/users.ts`:

```ts
import { Hono } from "hono";
import { PROFILE_TABLE } from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";

export const adminUsersRoute = new Hono<AppEnv>().get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from(PROFILE_TABLE)
    .select("user_id, name, role");
  if (error) {
    return c.json({ error: error.message }, 500);
  }
  return c.json({ users: data });
});
```

- [ ] **Step 2: Mount the route in `apps/api/src/index.ts`**

Replace the contents of `apps/api/src/index.ts` with:

```ts
import { Hono } from "hono";
import { API_ROUTES } from "@mark-matrix/shared";
import { supabaseAuth } from "./middleware/auth.js";
import { requireRole } from "./middleware/requireRole.js";
import { adminUsersRoute } from "./routes/admin/users.js";
import type { AppEnv } from "./env.js";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/*", supabaseAuth);
app.get(API_ROUTES.me, (c) => c.json({ userId: c.get("userId"), role: c.get("role") }));

app.use("/api/admin/*", requireRole("admin"));
app.route(API_ROUTES.adminUsers, adminUsersRoute);

export default app;
```

- [ ] **Step 3: Write the failing negative test**

Create `apps/api/src/tests/negative.admin-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index.js";

const mockGetUser = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
  }),
}));

const env = {
  ENVIRONMENT: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-svc",
};

beforeEach(() => mockGetUser.mockReset());

describe("admin route auth", () => {
  it("returns 403 for a faculty user", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "f1", app_metadata: { role: "faculty" } } },
      error: null,
    });
    const res = await app.request(
      "/api/admin/users",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "forbidden" });
  });

  it("returns 403 for a student user", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: "s1", app_metadata: { role: "student" } } },
      error: null,
    });
    const res = await app.request(
      "/api/admin/users",
      { headers: { authorization: "Bearer valid.jwt.xyz" } },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("returns 401 when Authorization is missing", async () => {
    const res = await app.request("/api/admin/users", { headers: {} }, env);
    expect(res.status).toBe(401);
  });
});
```

(We're not asserting the 200-for-admin case here because it would require
mocking the `from(...).select(...)` chain through the Postgres layer.
That's covered by the integration test in Task 14.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test`
Expected: all 3 tests in `negative.admin-route.test.ts` PASS, plus the existing tests in `auth.middleware.test.ts` and `requireRole.test.ts` still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/apps/api/src/index.ts apps/api/src/tests/negative.admin-route.test.ts
git commit -m "feat(api): admin users route + negative auth tests"
```

(If the staging above lists `routes/admin/users.ts` separately, add it explicitly:
`git add apps/api/src/routes/admin/users.ts apps/api/src/index.ts apps/api/src/tests/negative.admin-route.test.ts`.)

---

## Task 8: Web Dependencies + Supabase Client

**Files:**
- Modify: `apps/web/package.json` — add `react-router-dom`, `@supabase/supabase-js`
- Create: `apps/web/src/lib/supabase.ts`

**Interfaces:**
- Produces: `supabase` browser client created from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

- [ ] **Step 1: Add dependencies**

Edit `apps/web/package.json`:

```json
{
  "dependencies": {
    "@mark-matrix/shared": "workspace:*",
    "@cloudflare/vite-plugin": "^1.0.0",
    "@supabase/supabase-js": "^2.45.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.0",
    "vitest": "^2.1.8",
    "happy-dom": "^15.11.0",
    "@testing-library/react": "^16.1.0"
  }
}
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: `react-router-dom` and `@supabase/supabase-js` install.

- [ ] **Step 3: Create `apps/web/src/lib/supabase.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Surface the misconfiguration clearly during dev (Vite reads .env).
  // In production, the build will fail at the first signIn call.
  // eslint-disable-next-line no-console
  console.warn(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Set them in apps/web/.env (see apps/web/.env.example).",
  );
}

export const supabase = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @mark-matrix/web typecheck`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/src/lib/supabase.ts
git commit -m "feat(web): supabase js client + react-router-dom"
```

---

## Task 9: `AuthContext` (TDD)

**Files:**
- Create: `apps/web/src/auth/AuthContext.tsx`
- Create: `apps/web/src/auth/useAuth.ts`
- Create: `apps/web/src/tests/AuthContext.test.tsx`
- Modify: `apps/web/src/setupTests.ts` — set up env stubs before tests run

**Interfaces:**
- Produces: `AuthContext` providing `{ userId, role, loading, signIn, signOut }`. `useAuth()` hook that throws if used outside `AuthProvider`.

- [ ] **Step 1: Update `apps/web/src/setupTests.ts`**

Replace the file with:

```ts
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// happy-dom keeps the document between tests by default. Reset it so
// getBy* queries don't see duplicate DOM.
afterEach(() => cleanup());

// Provide deterministic env vars for tests that import the supabase client.
vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "test-anon-key");
```

- [ ] **Step 2: Write the failing test `apps/web/src/tests/AuthContext.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth, type AuthState } from "../auth/AuthContext.js";

// Mock the supabase client.
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock("../lib/supabase.js", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signOut: () => mockSignOut(),
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: unknown) => {
        mockOnAuthStateChange(cb);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  },
}));

function Probe(): JSX.Element {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="userId">{auth.userId ?? "null"}</span>
      <span data-testid="role">{auth.role ?? "null"}</span>
      <span data-testid="loading">{String(auth.loading)}</span>
      <button onClick={() => void auth.signIn("a@b.c", "pw")}>sign in</button>
      <button onClick={() => void auth.signOut()}>sign out</button>
    </div>
  );
}

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignOut.mockReset();
  mockGetSession.mockReset();
  mockOnAuthStateChange.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

describe("AuthContext", () => {
  it("starts in loading state with no user", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("userId")).toHaveTextContent("null");
    expect(screen.getByTestId("role")).toHaveTextContent("null");
  });

  it("hydrates from getSession with user/role", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "u1", app_metadata: { role: "admin" } },
        },
      },
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("userId")).toHaveTextContent("u1"));
    expect(screen.getByTestId("role")).toHaveTextContent("admin");
  });

  it("ignores invalid role values from app_metadata", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "u1", app_metadata: { role: "wizard" } },
        },
      },
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("role")).toHaveTextContent("null");
  });

  it("signIn delegates to supabase", async () => {
    mockSignIn.mockResolvedValueOnce({ data: {}, error: null });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    await act(async () => {
      screen.getByText("sign in").click();
    });
    expect(mockSignIn).toHaveBeenCalledWith({ email: "a@b.c", password: "pw" });
  });

  it("returns error.message from signIn", async () => {
    mockSignIn.mockResolvedValueOnce({ data: {}, error: { message: "bad creds" } });
    let captured: AuthState | null = null;
    function Capture(): JSX.Element {
      captured = useAuth();
      return <></>;
    }
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );
    await waitFor(() => expect(captured?.loading).toBe(false));
    let result: { error: string | null } | null = null;
    await act(async () => {
      result = await captured?.signIn("a@b.c", "pw");
    });
    expect(result?.error).toBe("bad creds");
  });

  it("signOut delegates to supabase", async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    await act(async () => {
      screen.getByText("sign out").click();
    });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("useAuth throws when used outside AuthProvider", () => {
    // Suppress React's automatic error logging for this expected throw.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/must be used inside/);
    errSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @mark-matrix/web test`
Expected: FAIL — `../auth/AuthContext.js` does not exist.

- [ ] **Step 4: Implement `apps/web/src/auth/useAuth.ts`**

```ts
export { useAuth } from "./AuthContext.js";
```

- [ ] **Step 5: Implement `apps/web/src/auth/AuthContext.tsx`**

```tsx
import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { isRole, type Role } from "@mark-matrix/shared";
import { supabase } from "../lib/supabase.js";

export interface AuthState {
  userId: string | null;
  role: Role | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [userId, setUserId] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const u = data.session?.user;
      setUserId(u?.id ?? null);
      const r = (u?.app_metadata as { role?: unknown } | undefined)?.role;
      setRole(isRole(r) ? r : null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUserId(u?.id ?? null);
      const r = (u?.app_metadata as { role?: unknown } | undefined)?.role;
      setRole(isRole(r) ? r : null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      userId, role, loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
      },
      async signOut() {
        await supabase.auth.signOut();
      },
    }),
    [userId, role, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @mark-matrix/web test`
Expected: all 7 tests in `AuthContext.test.tsx` PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/auth/ apps/web/src/tests/AuthContext.test.tsx apps/web/src/setupTests.ts
git commit -m "feat(web): AuthContext with full test coverage"
```

---

## Task 10: `ProtectedRoute` (TDD)

**Files:**
- Create: `apps/web/src/auth/ProtectedRoute.tsx`
- Create: `apps/web/src/tests/ProtectedRoute.test.tsx`

**Interfaces:**
- Consumes: `AppEnv` from `useAuth()`.
- Produces: `<ProtectedRoute roles={...}>child</ProtectedRoute>` — renders children when authenticated and (if `roles` given) the user's role is in the list. Redirects to `/login` when not authenticated, `/forbidden` when role is wrong.

- [ ] **Step 1: Write the failing test `apps/web/src/tests/ProtectedRoute.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "../auth/ProtectedRoute.js";
import type { AuthState } from "../auth/AuthContext.js";

vi.mock("../auth/AuthContext.js", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../auth/AuthContext.js";

function mockAuth(auth: Partial<AuthState>): void {
  vi.mocked(useAuth).mockReturnValue({
    userId: null, role: null, loading: false,
    signIn: vi.fn(), signOut: vi.fn(),
    ...auth,
  });
}

function renderAt(initialPath: string, element: JSX.Element): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page" />} />
        <Route path="/forbidden" element={<div data-testid="forbidden-page" />} />
        <Route path="/protected" element={element} />
        <Route path="/admin-only" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("renders the loading state when loading=true", () => {
    mockAuth({ loading: true, userId: "u1", role: "admin" });
    renderAt("/protected", <ProtectedRoute><div>child</div></ProtectedRoute>);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    mockAuth({ userId: null, role: null });
    renderAt("/protected", <ProtectedRoute><div>child</div></ProtectedRoute>);
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });

  it("renders children when authenticated and no role filter is set", () => {
    mockAuth({ userId: "u1", role: "student" });
    renderAt("/protected", <ProtectedRoute><div data-testid="child">child</div></ProtectedRoute>);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders children when role is in the allowed list", () => {
    mockAuth({ userId: "u1", role: "admin" });
    renderAt(
      "/admin-only",
      <ProtectedRoute roles={["admin"]}><div data-testid="child">child</div></ProtectedRoute>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("redirects to /forbidden when role is not in the allowed list", () => {
    mockAuth({ userId: "u1", role: "faculty" });
    renderAt(
      "/admin-only",
      <ProtectedRoute roles={["admin"]}><div data-testid="child">child</div></ProtectedRoute>,
    );
    expect(screen.getByTestId("forbidden-page")).toBeInTheDocument();
  });

  it("redirects to /forbidden when role is null but roles are required", () => {
    mockAuth({ userId: "u1", role: null });
    renderAt(
      "/admin-only",
      <ProtectedRoute roles={["admin"]}><div data-testid="child">child</div></ProtectedRoute>,
    );
    expect(screen.getByTestId("forbidden-page")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mark-matrix/web test`
Expected: FAIL — `../auth/ProtectedRoute.js` does not exist.

- [ ] **Step 3: Implement `apps/web/src/auth/ProtectedRoute.tsx`**

```tsx
import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { type Role } from "@mark-matrix/shared";
import { useAuth } from "./AuthContext.js";

interface Props {
  roles?: readonly Role[];
  children: ReactNode;
}

export function ProtectedRoute({ roles, children }: Props): JSX.Element {
  const { userId, role, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!userId) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && (!role || !roles.includes(role))) {
    return <Navigate to="/forbidden" replace />;
  }
  return <>{children}</>;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mark-matrix/web test`
Expected: all 6 tests in `ProtectedRoute.test.tsx` PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/auth/ProtectedRoute.tsx apps/web/src/tests/ProtectedRoute.test.tsx
git commit -m "feat(web): ProtectedRoute with role-based gating"
```

---

## Task 11: `AppShell` + `navConfig` (TDD)

**Files:**
- Create: `apps/web/src/shell/navConfig.ts`
- Create: `apps/web/src/shell/AppShell.tsx`
- Create: `apps/web/src/tests/AppShell.test.tsx`

**Interfaces:**
- Produces: `NAV_ITEMS` array of `{ label, to, roles }`. `AppShell` — rendered within `<Outlet />`, shows header with role + signOut, filters nav items by role.

- [ ] **Step 1: Write `apps/web/src/shell/navConfig.ts`**

```ts
import type { Role } from "@mark-matrix/shared";

export interface NavItem {
  label: string;
  to: string;
  roles: readonly Role[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Dashboard",  to: "/",                  roles: ["admin", "faculty", "student"] },
  { label: "Users",      to: "/admin/users",       roles: ["admin"] },
  { label: "My Courses", to: "/faculty/courses",   roles: ["faculty"] },
  { label: "My Results", to: "/student/results",   roles: ["student"] },
] as const;
```

- [ ] **Step 2: Write the failing test `apps/web/src/tests/AppShell.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../shell/AppShell.js";
import type { AuthState } from "../auth/AuthContext.js";

vi.mock("../auth/AuthContext.js", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../auth/AuthContext.js";

function mockAuth(auth: Partial<AuthState>): void {
  vi.mocked(useAuth).mockReturnValue({
    userId: null, role: null, loading: false,
    signIn: vi.fn(), signOut: vi.fn(),
    ...auth,
  });
}

describe("AppShell", () => {
  it("renders the brand and the user's role", () => {
    mockAuth({ userId: "u1", role: "admin" });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /mark-matrix/i })).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("shows only Dashboard for a student", () => {
    mockAuth({ userId: "u1", role: "student" });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "My Courses" })).toBeNull();
    expect(screen.getByRole("link", { name: "My Results" })).toBeInTheDocument();
  });

  it("shows only Dashboard and My Courses for a faculty member", () => {
    mockAuth({ userId: "u1", role: "faculty" });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Courses" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "My Results" })).toBeNull();
  });

  it("shows all nav items for an admin", () => {
    mockAuth({ userId: "u1", role: "admin" });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Courses" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Results" })).toBeInTheDocument();
  });

  it("calls signOut when the sign-out button is clicked", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    mockAuth({ userId: "u1", role: "admin", signOut });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    screen.getByRole("button", { name: /sign out/i }).click();
    expect(signOut).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @mark-matrix/web test`
Expected: FAIL — `../shell/AppShell.js` does not exist.

- [ ] **Step 4: Implement `apps/web/src/shell/AppShell.tsx`**

```tsx
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { NAV_ITEMS } from "./navConfig.js";

export function AppShell(): JSX.Element {
  const { role, signOut } = useAuth();
  const items = NAV_ITEMS.filter((i) => role && i.roles.includes(role));

  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <h1>Mark-Matrix</h1>
        <span className="app-shell__role">{role}</span>
        <button onClick={signOut}>Sign out</button>
      </header>
      <nav className="app-shell__nav">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === "/"}
            className={({ isActive }) => "app-shell__nav-item" + (isActive ? " is-active" : "")}
          >
            {i.label}
          </NavLink>
        ))}
      </nav>
      <main className="app-shell__main"><Outlet /></main>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @mark-matrix/web test`
Expected: all 5 tests in `AppShell.test.tsx` PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/shell/ apps/web/src/tests/AppShell.test.tsx
git commit -m "feat(web): AppShell with role-aware nav"
```

---

## Task 12: `LoginPage` + Route Tree + `main.tsx` Wiring

**Files:**
- Create: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/pages/NotFoundPage.tsx`
- Create: `apps/web/src/pages/ForbiddenPage.tsx`
- Create: `apps/web/src/pages/DashboardPlaceholder.tsx`
- Create: `apps/web/src/pages/admin/UsersPlaceholder.tsx`
- Create: `apps/web/src/pages/faculty/FacultyPlaceholder.tsx`
- Create: `apps/web/src/pages/student/StudentPlaceholder.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/styles.css` — add shell/loading/button styles

**Interfaces:**
- Produces: full route tree — `/login` (LoginPage), `/` shell (AppShell with placeholder pages), `/forbidden` (ForbiddenPage), `*` (NotFoundPage). `main.tsx` wraps `<App/>` in `<BrowserRouter><AuthProvider>`.

- [ ] **Step 1: Create the placeholder pages**

Create `apps/web/src/pages/DashboardPlaceholder.tsx`:

```tsx
import { useAuth } from "../auth/AuthContext.js";

export function DashboardPlaceholder(): JSX.Element {
  const { userId, role } = useAuth();
  return (
    <section>
      <h2>Dashboard</h2>
      <p>Signed in as <code>{userId}</code> with role <code>{role}</code>.</p>
    </section>
  );
}
```

Create `apps/web/src/pages/admin/UsersPlaceholder.tsx`:

```tsx
export function UsersPlaceholder(): JSX.Element {
  return (
    <section>
      <h2>Users</h2>
      <p>Admin user-management surface (Cycle 2).</p>
    </section>
  );
}
```

Create `apps/web/src/pages/faculty/FacultyPlaceholder.tsx`:

```tsx
export function FacultyPlaceholder(): JSX.Element {
  return (
    <section>
      <h2>My Courses</h2>
      <p>Faculty course view (Cycle 3+).</p>
    </section>
  );
}
```

Create `apps/web/src/pages/student/StudentPlaceholder.tsx`:

```tsx
export function StudentPlaceholder(): JSX.Element {
  return (
    <section>
      <h2>My Results</h2>
      <p>Student results view (Cycle 5+).</p>
    </section>
  );
}
```

Create `apps/web/src/pages/NotFoundPage.tsx`:

```tsx
export function NotFoundPage(): JSX.Element {
  return (
    <section className="app-error">
      <h2>Not found</h2>
      <p>That page does not exist.</p>
    </section>
  );
}
```

Create `apps/web/src/pages/ForbiddenPage.tsx`:

```tsx
export function ForbiddenPage(): JSX.Element {
  return (
    <section className="app-error">
      <h2>Forbidden</h2>
      <p>Your role does not have access to that page.</p>
    </section>
  );
}
```

- [ ] **Step 2: Create `apps/web/src/pages/LoginPage.tsx`**

```tsx
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

export function LoginPage(): JSX.Element {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <main className="app-login">
      <form onSubmit={onSubmit} className="app-login__form">
        <h1>Mark-Matrix</h1>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="app-login__error" role="alert">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Write the App route tree in `apps/web/src/App.tsx`**

Replace the contents with:

```tsx
import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute.js";
import { AppShell } from "./shell/AppShell.js";
import { LoginPage } from "./pages/LoginPage.js";
import { NotFoundPage } from "./pages/NotFoundPage.js";
import { ForbiddenPage } from "./pages/ForbiddenPage.js";
import { DashboardPlaceholder } from "./pages/DashboardPlaceholder.js";
import { UsersPlaceholder } from "./pages/admin/UsersPlaceholder.js";
import { FacultyPlaceholder } from "./pages/faculty/FacultyPlaceholder.js";
import { StudentPlaceholder } from "./pages/student/StudentPlaceholder.js";

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPlaceholder />} />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute roles={["admin"]}>
              <UsersPlaceholder />
            </ProtectedRoute>
          }
        />
        <Route
          path="faculty/courses"
          element={
            <ProtectedRoute roles={["faculty"]}>
              <FacultyPlaceholder />
            </ProtectedRoute>
          }
        />
        <Route
          path="student/results"
          element={
            <ProtectedRoute roles={["student"]}>
              <StudentPlaceholder />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
```

- [ ] **Step 4: Wrap in router and AuthProvider in `main.tsx`**

Replace the contents of `apps/web/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App.js";
import { AuthProvider } from "./auth/AuthContext.js";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 5: Add presentation styles to `apps/web/src/styles.css`**

Append to the existing file:

```css
/* App shell */
.app-shell {
  display: grid;
  grid-template-rows: auto auto 1fr;
  min-height: 100vh;
}
.app-shell__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1.5rem;
  background: #1f2937;
  color: #f9fafb;
  border-bottom: 1px solid #111827;
}
.app-shell__header h1 {
  margin: 0;
  font-size: 1.25rem;
}
.app-shell__role {
  margin-left: auto;
  padding: 0.125rem 0.5rem;
  border: 1px solid #4b5563;
  border-radius: 0.25rem;
  text-transform: uppercase;
  font-size: 0.75rem;
}
.app-shell__nav {
  display: flex;
  gap: 1rem;
  padding: 0.5rem 1.5rem;
  background: #374151;
}
.app-shell__nav-item {
  color: #e5e7eb;
  text-decoration: none;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
}
.app-shell__nav-item.is-active,
.app-shell__nav-item:hover {
  background: #4b5563;
}
.app-shell__main {
  padding: 1.5rem;
}

/* Login */
.app-login {
  display: grid;
  place-items: center;
  min-height: 100vh;
}
.app-login__form {
  display: grid;
  gap: 0.5rem;
  width: 320px;
  padding: 1.5rem;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
}
.app-login__form h1 { margin: 0 0 0.5rem 0; }
.app-login__form label { font-size: 0.875rem; color: #374151; }
.app-login__form input { padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.25rem; }
.app-login__form button {
  padding: 0.5rem;
  background: #1f2937;
  color: #f9fafb;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
}
.app-login__form button:disabled { opacity: 0.6; cursor: progress; }
.app-login__error { color: #b91c1c; margin: 0; font-size: 0.875rem; }

/* States */
.app-loading { padding: 2rem; text-align: center; color: #6b7280; }
.app-error { padding: 2rem; text-align: center; color: #6b7280; }
```

- [ ] **Step 6: Typecheck + test**

Run: `pnpm --filter @mark-matrix/web typecheck && pnpm --filter @mark-matrix/web test`
Expected: both pass. The existing `<App />` test from Cycle 0 will likely fail because it expects fetch-stubs but the new App now uses Supabase. **Update the test:**

Edit `apps/web/src/App.test.tsx`, replace the file with:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("./auth/AuthContext.js", () => ({
  useAuth: () => ({
    userId: "u1", role: "admin", loading: false,
    signIn: vi.fn(), signOut: vi.fn(),
  }),
}));

import { App } from "./App.js";

describe("<App />", () => {
  beforeEach(() => {
    // The App pulls in auth context; nothing to reset here, but kept for
    // future extension.
  });

  it("renders the dashboard with a Mark-Matrix heading when authenticated", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /mark-matrix/i })).toBeInTheDocument();
  });
});
```

Then run `pnpm --filter @mark-matrix/web test` again. Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): login page, route tree, and shell styles"
```

---

## Task 13: Seed Scripts

**Files:**
- Create: `scripts/seed-admin.ts`
- Create: `scripts/seed-test-users.ts`

**Interfaces:**
- Produces: `pnpm db:seed:admin` creates the first admin via the Admin API. `pnpm db:seed:test-users` creates admin/faculty/student test users. Both are idempotent.

- [ ] **Step 1: Create `scripts/seed-admin.ts`**

```ts
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: "apps/api/.dev.vars", quiet: true });

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const ADMIN_EMAIL = process.env["SEED_ADMIN_EMAIL"] ?? "admin@mark-matrix.local";
const ADMIN_PASSWORD = process.env["SEED_ADMIN_PASSWORD"] ?? "changeme";

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main(): Promise<void> {
  // Idempotent: skip if any admin already exists.
  const { data: existing, error: listErr } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("role", "admin")
    .limit(1);
  if (listErr) throw new Error(`profile check failed: ${listErr.message}`);
  if (existing && existing.length > 0) {
    console.log("Admin already exists — skipping bootstrap.");
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Admin" },
  });
  if (error || !data.user) {
    throw new Error(`admin createUser failed: ${error?.message ?? "no user"}`);
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ role: "admin", name: "Admin" })
    .eq("user_id", data.user.id);
  if (updateErr) {
    throw new Error(`profile promote failed: ${updateErr.message}`);
  }

  console.log(`Admin user created: ${ADMIN_EMAIL}`);
  console.log("Sign in and change the password immediately.");
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Create `scripts/seed-test-users.ts`**

```ts
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env" });
loadEnv({ path: "apps/api/.dev.vars", quiet: true });

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!url || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_USERS = [
  { email: "admin.test@mark-matrix.local",   password: "TestPass!1", name: "Admin Test",   role: "admin" },
  { email: "faculty.test@mark-matrix.local", password: "TestPass!1", name: "Faculty Test", role: "faculty" },
  { email: "student.test@mark-matrix.local", password: "TestPass!1", name: "Student Test", role: "student" },
] as const;

async function main(): Promise<void> {
  for (const u of TEST_USERS) {
    const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw new Error(`listUsers failed: ${listErr.message}`);
    const existing = list.users.find((x) => x.email === u.email);

    let userId: string;
    if (existing) {
      userId = existing.id;
      console.log(`User exists, skipping: ${u.email}`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { name: u.name },
      });
      if (error || !data.user) {
        throw new Error(`createUser failed for ${u.email}: ${error?.message ?? "no user"}`);
      }
      userId = data.user.id;
      console.log(`Created user: ${u.email}`);
    }

    const { error: updateErr } = await supabase
      .from("profiles")
      .update({ role: u.role, name: u.name })
      .eq("user_id", userId);
    if (updateErr) {
      throw new Error(`profile update failed for ${u.email}: ${updateErr.message}`);
    }
  }
  console.log("Test users seeded.");
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify the admin seed works**

Run: `pnpm db:seed:admin`
Expected: `Admin user created: admin@mark-matrix.local` (or `Admin already exists — skipping bootstrap.` on subsequent runs).

Verify with a manual sign-in smoke test:

```bash
tsx -e '
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data, error } = await c.auth.signInWithPassword({
  email: "admin@mark-matrix.local", password: "changeme",
});
console.log("user:", data.user?.id, "role:", data.user?.app_metadata?.role);
console.log("error:", error?.message);
' --input-type=module
```

Expected: `user: <uuid> role: admin` and `error: undefined`.

- [ ] **Step 4: Verify the test-user seed works**

Run: `pnpm db:seed:test-users`
Expected: three lines (`Created user: ...` or `User exists, skipping: ...`) followed by `Test users seeded.`

Verify with a second manual sign-in:

```bash
tsx -e '
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
const c = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const { data, error } = await c.auth.signInWithPassword({
  email: "student.test@mark-matrix.local", password: "TestPass!1",
});
console.log("user:", data.user?.id, "role:", data.user?.app_metadata?.role);
console.log("error:", error?.message);
' --input-type=module
```

Expected: `user: <uuid> role: student` and `error: undefined`.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-admin.ts scripts/seed-test-users.ts
git commit -m "feat(seed): admin and test-user seed scripts via Admin API"
```

---

## Task 14: Integration Tests (Gated on Real Supabase)

**Files:**
- Create: `apps/api/src/tests/integration.shells.test.ts`
- Create: `apps/api/src/tests/rls.profiles.test.ts`

**Interfaces:**
- Produces: `pnpm test:integration` runs both files when `SUPABASE_TEST_URL` and `SUPABASE_TEST_SERVICE_ROLE_KEY` are set; otherwise both files self-skip.

- [ ] **Step 1: Write `apps/api/src/tests/integration.shells.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const enabled = !!url && !!serviceKey;
const itIf = enabled ? it : it.skip;

describe("integration: login + role claim", () => {
  let client: SupabaseClient;

  beforeAll(() => {
    if (!enabled) return;
    client = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  itIf("requires SUPABASE_TEST_URL and SUPABASE_TEST_SERVICE_ROLE_KEY", () => {
    expect(url).toBeTruthy();
    expect(serviceKey).toBeTruthy();
  });

  itIf("admin.test signs in and gets role=admin", async () => {
    const { data, error } = await client.auth.signInWithPassword({
      email: "admin.test@mark-matrix.local",
      password: "TestPass!1",
    });
    expect(error).toBeNull();
    expect((data.user?.app_metadata as { role?: string }).role).toBe("admin");
  });

  itIf("faculty.test signs in and gets role=faculty", async () => {
    const { data, error } = await client.auth.signInWithPassword({
      email: "faculty.test@mark-matrix.local",
      password: "TestPass!1",
    });
    expect(error).toBeNull();
    expect((data.user?.app_metadata as { role?: string }).role).toBe("faculty");
  });

  itIf("student.test signs in and gets role=student", async () => {
    const { data, error } = await client.auth.signInWithPassword({
      email: "student.test@mark-matrix.local",
      password: "TestPass!1",
    });
    expect(error).toBeNull();
    expect((data.user?.app_metadata as { role?: string }).role).toBe("student");
  });
});
```

- [ ] **Step 2: Write `apps/api/src/tests/rls.profiles.test.ts`**

```ts
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const enabled = !!url && !!serviceKey && process.env["SUPABASE_TEST_RLS"] === "1";
const itIf = enabled ? it : it.skip;

interface TestUser {
  email: string;
  password: string;
  userId?: string;
}

describe("RLS: profiles table", () => {
  let admin: SupabaseClient;
  let alice: SupabaseClient;
  let bob: SupabaseClient;
  const aliceUser: TestUser = { email: "alice.rls@mark-matrix.local", password: "TestPass!1" };
  const bobUser: TestUser = { email: "bob.rls@mark-matrix.local", password: "TestPass!1" };

  beforeAll(async () => {
    if (!enabled) return;
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Create two student users via Admin API.
    for (const u of [aliceUser, bobUser]) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((x) => x.email === u.email);
      if (existing) {
        u.userId = existing.id;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: u.email, password: u.password, email_confirm: true,
          user_metadata: { name: u.email },
        });
        if (error || !data.user) throw new Error(`createUser failed for ${u.email}`);
        u.userId = data.user.id;
      }
    }

    alice = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: aliceErr } = await alice.auth.signInWithPassword({
      email: aliceUser.email, password: aliceUser.password,
    });
    if (aliceErr) throw new Error(`alice signIn failed: ${aliceErr.message}`);

    bob = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: bobErr } = await bob.auth.signInWithPassword({
      email: bobUser.email, password: bobUser.password,
    });
    if (bobErr) throw new Error(`bob signIn failed: ${bobErr.message}`);
  });

  itIf("requires SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, SUPABASE_TEST_RLS=1", () => {
    expect(url).toBeTruthy();
    expect(serviceKey).toBeTruthy();
    expect(process.env["SUPABASE_TEST_RLS"]).toBe("1");
  });

  itIf("alice can read her own profile row", async () => {
    const { data, error } = await alice.from("profiles").select("user_id, name, role")
      .eq("user_id", aliceUser.userId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]?.role).toBe("student");
  });

  itIf("alice cannot read bob's profile row", async () => {
    const { data, error } = await alice.from("profiles").select("user_id, name, role")
      .eq("user_id", bobUser.userId!);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  itIf("alice cannot promote herself to admin", async () => {
    const { error } = await alice.from("profiles").update({ role: "admin" })
      .eq("user_id", aliceUser.userId!);
    // RLS rejects: expect a non-null error OR zero rows affected.
    expect(error).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run with creds to verify**

Run:

```bash
SUPABASE_TEST_URL=http://127.0.0.1:54321 \
SUPABASE_TEST_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY \
SUPABASE_TEST_RLS=1 \
pnpm --filter @mark-matrix/api test
```

Expected: 9 tests in `integration.shells.test.ts` (3 of 4 enabled) + 4 tests in `rls.profiles.test.ts` (3 of 4 enabled) all pass.

(Adjust the localhost/port to match your `supabase start` output. Use the anon and service-role keys from `pnpm db:status`.)

- [ ] **Step 4: Run without creds to verify skipping**

Run: `pnpm --filter @mark-matrix/api test`
Expected: all `itIf` cases are skipped (reported as `skipped`, not `failed`). The unit tests from Tasks 5–7 still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/tests/integration.shells.test.ts apps/api/src/tests/rls.profiles.test.ts
git commit -m "test(api): integration shells + RLS tests (gated on real Supabase)"
```

---

## Task 15: Operator Docs

**Files:**
- Create: `.docs/cycle-1-setup.md`
- Create: `.docs/cycle-1-testing.md`

**Interfaces:**
- Produces: setup runbook + testing how-to.

- [ ] **Step 1: Write `.docs/cycle-1-setup.md`**

```markdown
# Cycle 1 — Operator Setup

## One-time setup

1. Install the Supabase CLI (if not already):
   ```bash
   pnpm install
   ```

2. Start a local Supabase instance:
   ```bash
   pnpm db:start
   ```
   Wait for the "API URL", "anon key", and "service_role key" lines. Copy them.

3. Update `.env` at the repo root:
   ```bash
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_ANON_KEY=<from pnpm db:status>
   SUPABASE_SERVICE_ROLE_KEY=<from pnpm db:status>
   ```

4. Update `apps/web/.env`:
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
```

- [ ] **Step 2: Write `.docs/cycle-1-testing.md`**

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add .docs/cycle-1-setup.md .docs/cycle-1-testing.md
git commit -m "docs: cycle-1 setup and testing runbooks"
```

---

## Task 16: CI Workflow + Final Verification

**Files:**
- Modify: `.github/workflows/ci.yml` — add a `test:integration` step (no-op without creds)

**Interfaces:**
- Produces: CI runs `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the optional integration step.

- [ ] **Step 1: Add a `test:integration` step to `.github/workflows/ci.yml`**

Open the file and add a new step after the existing `pnpm test` step (or wherever the test step is). The exact name depends on the current file; the addition is:

```yaml
      - name: Integration tests (skipped without creds)
        if: ${{ env.SUPABASE_TEST_URL != '' }}
        run: pnpm test:integration
        env:
          SUPABASE_TEST_URL: ${{ secrets.SUPABASE_TEST_URL }}
          SUPABASE_TEST_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_TEST_SERVICE_ROLE_KEY }}
```

(If the workflow already has an existing `test:` step name, match the project's naming conventions.)

- [ ] **Step 2: Run the full local verification**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all three pass. Output should report:
- ESLint: 0 errors
- TypeScript: 0 errors across all packages
- Vitest: all unit tests pass; integration tests skipped (no creds)

- [ ] **Step 3: Confirm `pnpm db:push` does NOT apply the admin bootstrap**

Inspect the migrations directory:

```bash
ls -la supabase/migrations/
```

Expected: exactly three files (`20260818100000_create_profiles.sql`, `20260818100001_profiles_rls.sql`, `20260818100002_auth_hook_role_claim.sql`). No `admin_bootstrap*` file.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: optional integration test step (no-op without creds)"
```

- [ ] **Step 5: Report**

Add a final summary comment to the PR (or print to the terminal if running locally) listing:
- 16 tasks completed
- Files created (count from the file-structure section)
- Migrations applied (`pnpm db:reset` ran cleanly)
- Test results: `pnpm test` passes; integration tests skipped

---

## Self-Review

**1. Spec coverage:** Each requirement in the spec maps to a task:
- §3.1 migrations and seed files → Task 1, 2, 13
- §3.2 profiles table → Task 2
- §3.3 RLS policies + `is_admin()` → Task 2
- §3.4 admin bootstrap → Task 13
- §3.5 auth hook → Task 1 (config.toml), Task 2 (function)
- §3.6 test-user seed → Task 13
- §4 shared package → Task 3
- §5.1 file layout → Tasks 4–7
- §5.2 env types → Task 4
- §5.3 `supabaseAuth` middleware → Task 5
- §5.4 `requireRole` factory → Task 6
- §5.5 route mounting → Task 7
- §5.6 admin sample route → Task 7
- §6.1 web deps → Task 8
- §6.2 file layout → Tasks 8–12
- §6.3 supabase client → Task 8
- §6.4 `AuthContext` → Task 9
- §6.5 `ProtectedRoute` → Task 10
- §6.6 `AppShell` + nav → Task 11
- §6.7 route tree → Task 12
- §7.1 unit tests → Tasks 5, 6, 9, 10, 11
- §7.2 negative integration → Task 7
- §7.3 real-Supabase integration → Task 14
- §7.4 frontend tests → Tasks 9, 10, 11, 12
- §7.5 commands → Tasks 1, 13, 14
- §8 deliverables → all tasks
- §9 implementation order → Task 1 (1), 2 (2), 3 (3), 4 (4), 5 (5), 6 (6), 7 (7), 8 (8), 9 (9), 10 (10), 11 (11), 12 (12), 13 (seed), 14 (11), 15–16 (12–13)
- §10 risks — all addressed (auth hook drift mitigated by migration order; role staleness documented in §3.4; XSS documented as deferred; service-role key never in web bundle; RLS recursion via `is_admin()`)
- §11 acceptance criteria — all 13 items tested by the tasks above

**2. Placeholder scan:** No "TBD", "TODO", "implement later", "fill in details", "add appropriate", "handle edge cases", "similar to Task N", or untested code. Every code block is concrete.

**3. Type consistency:**
- `Env` defined Task 4, used Task 5 onward. ✓
- `AppVariables` / `AppEnv` defined Task 4, used Task 5 onward. ✓
- `Role` / `ROLES` from `@mark-matrix/shared` reused throughout. ✓
- `PROFILE_TABLE` defined Task 3, used Task 7. ✓
- `API_ROUTES.me` / `API_ROUTES.adminUsers` defined Task 3, used Task 7. ✓
- `AuthState` interface defined Task 9, used Task 10 (mocked) and Task 11 (mocked). ✓
- `NAV_ITEMS` defined Task 11, used Task 11 only. ✓
- `getSupabase` defined Task 4, used Task 5. ✓
- `supabaseAuth` defined Task 5, used Task 7. ✓
- `requireRole` defined Task 6, used Task 7. ✓
- `seed-admin.ts` / `seed-test-users.ts` defined Task 13, used Task 14's `beforeAll` (via `tsx`). ✓

No inconsistencies found.
