# Cycle 1 — Auth, Sessions & RBAC Foundation

**Status:** Approved (pending user review of written spec)
**Date:** 2026-08-18
**Cycle:** 1 of 8 (per `.docs/Mark-Matrix-Cycle-Plan.md`)
**Stack:** React + Vite · Hono on Cloudflare Workers · Supabase (Postgres + Auth + RLS)

---

## 1. Purpose

Build the authentication, session, and role-based access foundation that every
subsequent cycle depends on. After this cycle, the system knows who the user
is and what they are allowed to do — both at the API layer (Hono middleware)
and at the database layer (Supabase RLS).

### Scope

- Email/password authentication via Supabase Auth.
- A `profiles` table linked to `auth.users` carrying `name` and `role`.
- A `custom_access_token` auth hook that injects `role` into the JWT
  `app_metadata`, so the API can read the role from the verified token with
  zero DB hits per request.
- Hono middleware: `supabaseAuth` (verifies JWT, attaches `userId`/`role` to
  context) and `requireRole` factory (role-guard).
- RLS policies on `profiles` enforcing: a user can SELECT their own row;
  admins can SELECT all rows; only admins can write the `role` column.
- React: `LoginPage`, `AuthContext`, `ProtectedRoute`, and a role-aware
  `AppShell` showing different nav items per role.
- Unit + integration tests covering middleware, role guards, RLS, and the
  three role-based shells.

### Out of scope (later cycles)

- Admin CRUD UI for users/courses/etc. (Cycle 2)
- Attendance module (Cycle 3)
- Marks entry, grading, approval workflow (Cycles 4–6)
- Audit logging (Cycle 8)
- Production deployment (Cycle 8)

---

## 2. Architecture

Three layers with cleanly separated concerns:

```
┌─────────────────────────────────────────────────────────────────────┐
│ apps/web (React + Vite + React Router v6)                           │
│  ┌──────────────┐  ┌───────────────────┐  ┌──────────────────────┐  │
│  │ LoginPage    │  │ AuthContext       │  │ AppShell / Protected │  │
│  │ (email/pw)   │──▶ { userId, role,  │──▶ Route              │  │
│  │              │  │   signIn, signOut }│  │ (role-aware nav)     │  │
│  └──────────────┘  └───────────────────┘  └──────────────────────┘  │
│         │  supabase-js session (localStorage)                       │
└─────────┼───────────────────────────────────────────────────────────┘
          │ Authorization: Bearer <jwt>
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ apps/api (Hono on Cloudflare Workers)                               │
│  ┌────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │
│  │ supabaseAuth   │─▶│ requireRole     │─▶│ Route handler       │  │
│  │ (middleware)   │  │ (factory)       │  │ (e.g. /api/admin/*) │  │
│  │  - getUser(jwt)│  │                 │  │                     │  │
│  │  - read role   │  │                 │  │                     │  │
│  │    from claim  │  │                 │  │                     │  │
│  └────────────────┘  └─────────────────┘  └─────────────────────┘  │
│                                                                     │
│  Context vars (typed): { userId, role, supabase }                   │
└─────────┬───────────────────────────────────────────────────────────┘
          │ uses anon key (RLS-bound) for user-scoped queries
          │ uses service-role key only in admin handlers (none in C1)
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Supabase (Postgres + Auth + RLS)                                    │
│  ┌────────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │ auth.users     │  │ profiles     │  │ RLS policies            │  │
│  │ (managed)      │──│ (user_id PK, │  │  - own SELECT           │  │
│  │                │  │  name, role) │  │  - admin SELECT ALL     │  │
│  │                │  │              │  │  - role write: admin    │  │
│  └────────────────┘  └──────────────┘  └─────────────────────────┘  │
│                                                                     │
│  Auth hook (custom_access_token) injects role into app_metadata     │
│  on every JWT mint.                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### Key invariants

1. The API **trusts the JWT's `role` claim** after `supabase.auth.getUser(jwt)`
   verifies the signature — no DB lookup per request.
2. The DB enforces the same rules independently via RLS, so even if a route
   forgets a guard, the DB refuses.
3. The web bundle never sees the service-role key. Only the API does.
4. The `role` source of truth is the `profiles.role` column. The JWT
   contains a *snapshot* of it, refreshed on every token mint.

---

## 3. Database

### 3.1 Migrations

All migrations live under `supabase/migrations/` and are applied with the
Supabase CLI (`supabase db push`).

```
supabase/
├── config.toml
├── migrations/
│   ├── 20260818100000_create_profiles.sql
│   ├── 20260818100001_profiles_rls.sql
│   ├── 20260818100002_admin_bootstrap.sql
│   └── 20260818100003_auth_hook_role_claim.sql
└── seed/
    └── test_users.sql
```

### 3.2 `profiles` table

```sql
create type public.user_role as enum ('admin', 'faculty', 'student');

create table public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  role       public.user_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

A trigger on `auth.users` auto-creates a profile row with `role = 'student'`
on signup. The signup form sets `name` in `raw_user_meta_data`; the trigger
reads it (or falls back to the email prefix).

```sql
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

The default role is `student`. Promotion to `admin` or `faculty` is done in
SQL (the bootstrap migration seeds the first admin; Cycle 2 will add an
admin endpoint).

### 3.3 RLS policies

```sql
alter table public.profiles enable row level security;

-- Self SELECT: a user can read their own row.
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Admin SELECT: admins can read all rows.
create policy "profiles_select_admin"
  on public.profiles for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid()) and p.role = 'admin'
    )
  );

-- Self UPDATE: a user can update their own profile, but NOT the role column.
-- The WITH CHECK compares the incoming role against the existing row,
-- rejecting any change.
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and role = (select role from public.profiles where user_id = (select auth.uid()))
  );

-- Admin UPDATE: admins can update any row (including role).
create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid()) and p.role = 'admin'
    )
  );

-- No INSERT policy: profiles are created by the trigger only.
-- No DELETE policy: profile deletion cascades from auth.users.
```

**Recursion safety:** policies reference `auth.uid()` and the `profiles`
table inside subqueries. The `select role from profiles where user_id = auth.uid()`
subquery is bounded to the calling row, so no infinite recursion occurs.

### 3.4 Admin bootstrap

`supabase/migrations/20260818100002_admin_bootstrap.sql` is **idempotent**
and **local-only**. It inserts one admin user if no admin exists. The
operator edits the `admin_email` constant before running cycle 1 locally.

```sql
do $$
declare
  admin_email text := 'admin@mark-matrix.local';
  admin_id    uuid;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    return;
  end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                          email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token,
                          email_change, email_change_token_new, recovery_token)
  values (00000000-0000-0000-0000-000000000000,
          gen_random_uuid(), 'authenticated', 'authenticated',
          admin_email, crypt('changeme', gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"name":"Admin"}'::jsonb, now(), now(), '', '', '', '')
  returning id into admin_id;

  insert into public.profiles (user_id, name, role)
  values (admin_id, 'Admin', 'admin')
  on conflict do nothing;
end $$;
```

The README runbook instructs: edit `admin_email`, run `supabase db reset`,
then sign in with the bootstrap password (`changeme`) and change it
immediately via the Supabase dashboard or the auth admin API.

### 3.5 Auth hook: `custom_access_token`

```sql
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

This hook is wired in the Supabase dashboard under Auth → Hooks.
Configuration is documented in the operator runbook.

### 3.6 Test-user seed

`supabase/seed/test_users.sql` (separate from migrations) is loaded by
integration tests via `supabase db reset --seed`. It creates three rows
(idempotent):

- `admin.test@mark-matrix.local` / `TestPass!1` / role `admin`
- `faculty.test@mark-matrix.local` / `TestPass!1` / role `faculty`
- `student.test@mark-matrix.local` / `TestPass!1` / role `student`

---

## 4. Shared package

`packages/shared/src/auth.ts` adds cross-cutting constants the API and web
both import:

```ts
export const PROFILE_TABLE = "profiles" as const;
export const AUTH_HOOK_NAME = "custom_access_token" as const;
```

`API_ROUTES` (in `packages/shared/src/index.ts`) gains:

```ts
me: "/api/me",
login: "/login",
forbidden: "/forbidden",
adminUsers: "/api/admin/users",
```

The existing `Role` and `ROLES` exports are reused.

---

## 5. API (Hono)

### 5.1 File layout

```
apps/api/src/
├── index.ts                       # extended app entry
├── env.ts                         # Env, AppVariables, AppEnv types
├── lib/
│   └── supabase.ts                # createClient(env, opts) factory
├── middleware/
│   ├── auth.ts                    # supabaseAuth
│   └── requireRole.ts             # requireRole factory
├── routes/
│   └── admin/
│       └── users.ts               # GET /api/admin/users
└── tests/
    ├── auth.middleware.test.ts
    ├── requireRole.test.ts
    ├── negative.admin-route.test.ts
    ├── integration.shells.test.ts
    └── rls.profiles.test.ts
```

### 5.2 Typed context

```ts
// apps/api/src/env.ts
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

### 5.3 `supabaseAuth` middleware

```ts
// apps/api/src/middleware/auth.ts
import { createClient } from "@supabase/supabase-js";
import type { MiddlewareHandler } from "hono";
import { isRole } from "@mark-matrix/shared";
import type { AppEnv } from "../env.js";

export const supabaseAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) {
    return c.json({ error: "missing_authorization" }, 401);
  }
  const jwt = header.slice(7).trim();
  if (!jwt) return c.json({ error: "missing_authorization" }, 401);

  const supabase = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) {
    return c.json({ error: "invalid_session" }, 401);
  }

  const roleClaim = (data.user.app_metadata as { role?: unknown })?.role;
  if (!isRole(roleClaim)) {
    return c.json({ error: "role_missing_or_invalid" }, 403);
  }

  c.set("userId", data.user.id);
  c.set("role", roleClaim);
  c.set("supabase", supabase);
  await next();
};
```

### 5.4 `requireRole` factory

```ts
// apps/api/src/middleware/requireRole.ts
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

### 5.5 Route mounting

```ts
// apps/api/src/index.ts
import { Hono } from "hono";
import { supabaseAuth } from "./middleware/auth.js";
import { requireRole } from "./middleware/requireRole.js";
import { adminUsersRoute } from "./routes/admin/users.js";
import type { AppEnv } from "./env.js";

const app = new Hono<AppEnv>();

app.get("/health", (c) =>
  c.json({ status: "ok", timestamp: new Date().toISOString() }),
);

app.use("/api/*", supabaseAuth);
app.get("/api/me", (c) =>
  c.json({ userId: c.get("userId"), role: c.get("role") }),
);

app.use("/api/admin/*", requireRole("admin"));
app.route("/api/admin/users", adminUsersRoute);

export default app;
```

### 5.6 `adminUsersRoute` (sample)

```ts
// apps/api/src/routes/admin/users.ts
import { Hono } from "hono";
import type { AppEnv } from "../../env.js";

export const adminUsersRoute = new Hono<AppEnv>().get("/", async (c) => {
  const supabase = c.get("supabase");
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, name, role");
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ users: data });
});
```

The service-role key is **not** used in Cycle 1; admin read access flows
through the user-scoped anon client + RLS policy.

---

## 6. Frontend (React)

### 6.1 Dependencies added to `apps/web/package.json`

- `@supabase/supabase-js@^2.45.0`
- `react-router-dom@^6.26.0`

### 6.2 File layout

```
apps/web/src/
├── main.tsx                       # wraps <App/> in <BrowserRouter><AuthProvider>
├── App.tsx                        # <Routes> tree
├── lib/
│   └── supabase.ts                # createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
├── auth/
│   ├── AuthContext.tsx            # { userId, role, loading, signIn, signOut }
│   ├── ProtectedRoute.tsx         # <ProtectedRoute roles={...}> gate
│   └── useAuth.ts                 # re-export of useAuth
├── pages/
│   ├── LoginPage.tsx
│   ├── NotFoundPage.tsx
│   ├── ForbiddenPage.tsx
│   ├── DashboardPlaceholder.tsx
│   ├── admin/UsersPlaceholder.tsx
│   ├── faculty/FacultyPlaceholder.tsx
│   └── student/StudentPlaceholder.tsx
├── shell/
│   ├── AppShell.tsx               # header + nav + <Outlet/>
│   └── navConfig.ts               # NAV_ITEMS by role
└── tests/
    ├── AuthContext.test.tsx
    ├── ProtectedRoute.test.tsx
    └── shell.integration.test.tsx
```

### 6.3 Supabase client

```ts
// apps/web/src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
```

The browser persists the session in localStorage by default. The JWT is
read by the API client and sent as `Authorization: Bearer <jwt>`.

### 6.4 `AuthContext`

Restores session on mount, subscribes to auth-state changes, exposes
`signIn(email, password)` and `signOut()`. The role is read from
`user.app_metadata.role` (set by the auth hook).

```ts
// apps/web/src/auth/AuthContext.tsx
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

### 6.5 `ProtectedRoute`

```tsx
// apps/web/src/auth/ProtectedRoute.tsx
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

### 6.6 `AppShell` + role-aware nav

```ts
// apps/web/src/shell/navConfig.ts
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

```tsx
// apps/web/src/shell/AppShell.tsx
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
          <NavLink key={i.to} to={i.to} end={i.to === "/"}>{i.label}</NavLink>
        ))}
      </nav>
      <main className="app-shell__main"><Outlet /></main>
    </div>
  );
}
```

### 6.7 `App.tsx` route tree

```tsx
// apps/web/src/App.tsx
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
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/" element={<DashboardPlaceholder />} />
        <Route path="admin/users" element={
          <ProtectedRoute roles={["admin"]}><UsersPlaceholder /></ProtectedRoute>
        } />
        <Route path="faculty/courses" element={
          <ProtectedRoute roles={["faculty"]}><FacultyPlaceholder /></ProtectedRoute>
        } />
        <Route path="student/results" element={
          <ProtectedRoute roles={["student"]}><StudentPlaceholder /></ProtectedRoute>
        } />
      </Route>
      <Route path="/forbidden" element={<ForbiddenPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
```

---

## 7. Testing

### 7.1 Unit tests (mocked Supabase client)

Run inside `@cloudflare/vitest-pool-workers`. Mock `@supabase/supabase-js`
so no network is involved.

**`tests/auth.middleware.test.ts`** — covers:
- Missing `Authorization` header → 401 `{ error: "missing_authorization" }`
- Invalid/expired JWT (mock `getUser` returns `{ error }`) → 401
- Valid JWT but missing or invalid `role` claim → 403
- Valid JWT with valid `role` claim → 200 with `{ userId, role }`

**`tests/requireRole.test.ts`** — builds a tiny app with a route guarded
by `requireRole("admin")`, drives it with fake `c.set("role", ...)` context,
asserts 200 for `"admin"` and 403 for `"faculty"` / `"student"`.

### 7.2 Negative integration: faculty → 403 on admin route

`tests/negative.admin-route.test.ts`. Uses the real `supabaseAuth` middleware
against a mocked Supabase client that returns a faculty user. Calls
`GET /api/admin/users` and expects 403. Verifies the full middleware chain
(auth → requireRole) without hitting Supabase.

### 7.3 Real-Supabase integration tests (gated)

Connect to a real Supabase test project. Run only when
`SUPABASE_TEST_URL` and `SUPABASE_TEST_SERVICE_ROLE_KEY` are set; otherwise
**skipped** (not failed) so CI without creds still passes.

**`tests/integration.shells.test.ts`** — three tests:
- `admin.test@mark-matrix.local` login → `app_metadata.role === "admin"`
- `faculty.test@mark-matrix.local` login → `app_metadata.role === "faculty"`
- `student.test@mark-matrix.local` login → `app_metadata.role === "student"`

**`tests/rls.profiles.test.ts`** — using the service-role client, create
two test profiles (alice and bob, both students). Then sign in as alice
via `signInWithPassword` on a *user-scoped* client, attempt `SELECT user_id,
name, role FROM profiles WHERE user_id != $own`, and assert the result is
empty (RLS blocked the read). Verify alice can read her own row.

### 7.4 Frontend tests

**`tests/AuthContext.test.tsx`** — mocks `../lib/supabase.js`, asserts:
- Initial state: `loading=true`, `userId=null`, `role=null`.
- After mocked `signInWithPassword`: `loading=false`, `userId` set, `role` set
  from `app_metadata.role`.
- `signOut` clears state.

**`tests/ProtectedRoute.test.tsx`** — stub `useAuth` returns controllable
state, asserts:
- No `userId` → navigates to `/login`.
- Wrong role → navigates to `/forbidden`.
- Correct role → renders children.

**`tests/shell.integration.test.tsx`** — same shape as the API tier 3 but
runs through React: render `<App/>` with each test user, assert the visible
nav items match the role.

### 7.5 Commands

```jsonc
// root package.json
"scripts": {
  "test":            "pnpm -r test",
  "test:integration":"SUPABASE_TEST_URL=... SUPABASE_TEST_SERVICE_ROLE_KEY=... pnpm -r test",
  "test:rls":        "SUPABASE_TEST_URL=... SUPABASE_TEST_RLS=1 pnpm --filter @mark-matrix/api test",
  "db:reset":        "supabase db reset",
  "db:push":         "supabase db push",
  "db:seed:test":    "supabase db reset --seed supabase/seed/test_users.sql"
}
```

---

## 8. Deliverables

### Code files

**Shared** (`packages/shared/src/`):
- `auth.ts` — `PROFILE_TABLE`, `AUTH_HOOK_NAME`
- `index.ts` — extended `API_ROUTES` (`me`, `login`, `forbidden`, `adminUsers`)

**API** (`apps/api/src/`):
- `env.ts`
- `lib/supabase.ts`
- `middleware/auth.ts`
- `middleware/requireRole.ts`
- `routes/admin/users.ts`
- `index.ts` (extended)
- `tests/auth.middleware.test.ts`
- `tests/requireRole.test.ts`
- `tests/negative.admin-route.test.ts`
- `tests/integration.shells.test.ts`
- `tests/rls.profiles.test.ts`

**Web** (`apps/web/src/`):
- `lib/supabase.ts`
- `auth/AuthContext.tsx`
- `auth/ProtectedRoute.tsx`
- `auth/useAuth.ts`
- `pages/LoginPage.tsx`
- `pages/NotFoundPage.tsx`
- `pages/ForbiddenPage.tsx`
- `pages/DashboardPlaceholder.tsx`
- `pages/admin/UsersPlaceholder.tsx`
- `pages/faculty/FacultyPlaceholder.tsx`
- `pages/student/StudentPlaceholder.tsx`
- `shell/AppShell.tsx`
- `shell/navConfig.ts`
- `main.tsx` (extended)
- `App.tsx` (extended)
- `tests/AuthContext.test.tsx`
- `tests/ProtectedRoute.test.tsx`
- `tests/shell.integration.test.tsx`

### Migrations

`supabase/config.toml` plus four migrations and one seed file under
`supabase/migrations/` and `supabase/seed/`.

### Configs & docs

- `packages/shared/package.json` — no change (just exports)
- `apps/api/package.json` — possibly add `supabase` CLI dev-dep in root
- `apps/web/package.json` — add `react-router-dom`, `@supabase/supabase-js`
- `package.json` (root) — add `supabase` dev-dep + scripts
- `.github/workflows/ci.yml` — add `test:integration` step (no-op without creds)
- `.docs/cycle-1-setup.md` — operator runbook
- `.docs/cycle-1-testing.md` — how to run integration/RLS tests locally

---

## 9. Implementation Order

Each step is independently testable; later steps build on earlier ones.

1. **Infra prep** — add `supabase` CLI dev-dep, `supabase config.toml`, root scripts.
2. **Migrations** — write the four SQL files + `seed/test_users.sql`. Manually
   verify with `supabase db reset` locally.
3. **Shared types/constants** — extend `API_ROUTES`, add `auth.ts` exports.
4. **API: `env.ts` + `lib/supabase.ts` factory** — type-safety foundation.
5. **API: `supabaseAuth` middleware + `/api/me`** — write tests **first** (TDD),
   then implement.
6. **API: `requireRole` factory** — write tests first, then implement.
7. **API: admin sample route + negative test** — faculty → 403.
8. **Web: Supabase client + `AuthContext` + `useAuth`** — write tests first.
9. **Web: `ProtectedRoute` + `AppShell` + nav config** — write tests first.
10. **Web: `LoginPage` + `App.tsx` route tree** — wire it all up.
11. **Integration tests** (real Supabase, gated) — `shells` and `RLS`.
12. **Docs** — `cycle-1-setup.md`, `cycle-1-testing.md`.
13. **Final verification** — `pnpm lint && pnpm typecheck && pnpm test` passes;
    CI green.

TDD discipline applies at every step that introduces logic. The
`superpowers:test-driven-development` skill will be invoked during
implementation.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Auth hook drift (hook enabled in dashboard but DB function missing) | Migration order requires the hook function before the bootstrap admin so JWTs for the bootstrap user also get the role. |
| Role claim staleness (admin promotes a user; role not visible until next token refresh) | Acceptable for Cycle 1: role changes are admin-only and rare. Documented in `.docs/cycle-1-setup.md`. |
| JWT in localStorage (XSS exposure) | Acceptable for this scaffold: no SSR, no third-party scripts. Cycle 8 will revisit httpOnly cookies. |
| Service-role key in API bundle | Service-role key never referenced from the web bundle. The API only references it where needed (none in Cycle 1). |
| RLS recursion in admin policies | All role lookups use subqueries bounded to the calling row. Documented in §3.3. |
| `noUncheckedIndexedAccess` strict TS | `header.slice(7)` returns `string`; type-narrowed in `supabaseAuth`. No index access in hot paths. |

---

## 11. Acceptance Criteria

- [ ] `supabase db push` applies all four migrations cleanly.
- [ ] An admin user can sign in via the React login page and sees the admin
      nav including "Users".
- [ ] A faculty user can sign in and sees the faculty nav including "My Courses".
- [ ] A student user can sign in and sees the student nav including "My Results".
- [ ] `GET /api/me` with a valid token returns `{ userId, role }`.
- [ ] `GET /api/admin/users` returns 403 for faculty and student; 200 for admin.
- [ ] A student querying `profiles` via Supabase JS sees only their own row.
- [ ] All unit tests pass (`pnpm test`).
- [ ] Integration tests pass when test creds are supplied (`pnpm test:integration`).
- [ ] CI passes on push when no test creds are configured (integration tests skipped).
- [ ] `pnpm lint && pnpm typecheck` passes.
