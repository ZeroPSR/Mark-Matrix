#!/usr/bin/env bash
# Remaining config files: ESLint, Prettier, CI, CLAUDE.md, .env.example,
# App.tsx fix. Idempotent — safe to re-run.
set -euo pipefail

# --- ESLint flat config (root) ---------------------------------------------
cat > eslint.config.mjs <<'EOF'
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.wrangler/**",
      "**/coverage/**",
      "**/.vite/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: [
      "apps/web/**/*.{ts,tsx}",
      "apps/web/src/**/*.{ts,tsx}",
    ],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    rules: {
      "react/jsx-uses-react": "off",
      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["apps/api/**/*.ts", "packages/**/*.ts", "scripts/**/*.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "warn",
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
);
EOF

# --- Prettier ---------------------------------------------------------------
cat > .prettierrc.json <<'EOF'
{
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true,
  "arrowParens": "always"
}
EOF

cat > .prettierignore <<'EOF'
node_modules
dist
build
.wrangler
.vite
coverage
pnpm-lock.yaml
EOF

# --- GitHub Actions CI ------------------------------------------------------
cat > .github/workflows/ci.yml <<'EOF'
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    name: Lint, Typecheck, Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 11

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Typecheck
        run: pnpm typecheck

      - name: Test
        run: pnpm test
EOF

# --- CLAUDE.md --------------------------------------------------------------
cat > CLAUDE.md <<'EOF'
# Mark-Matrix — Claude Code Notes

An online result processing system. This file documents the repository layout,
coding conventions, the data hierarchy, and the three roles so the
assistant has the domain context in one place.

## 1. Folder Structure

```
mark-matrix/
├── apps/
│   ├── web/           React + Vite frontend (Cloudflare Pages/Workers)
│   │   ├── src/
│   │   ├── public/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── tsconfig.json
│   └── api/           Hono backend (Cloudflare Workers)
│       ├── src/
│       ├── wrangler.jsonc
│       └── tsconfig.json
├── packages/
│   └── shared/        Cross-package types/constants (ROLES, API_ROUTES, …)
├── scripts/
│   └── check-db.ts    Supabase connectivity check
├── .github/workflows/ci.yml
├── package.json       Workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json Strict TS settings inherited by all packages
└── eslint.config.mjs  Flat config (ESLint v9)
```

## 2. Coding Conventions

- **Package manager:** pnpm 11 with workspaces. Lockfile is committed.
- **Node:** ≥ 20. Use `node:protocol` for built-ins.
- **TypeScript:** strict mode (`tsconfig.base.json`). All packages extend it.
  `noUncheckedIndexedAccess` is on — treat `arr[i]` as `T | undefined`.
- **Imports:** `@mark-matrix/shared` for cross-package code. Prefer
  `import type` for type-only imports. `verbatimModuleSyntax` is off so
  default imports of TS files still work via the Vite/Wrangler transform.
- **Formatting:** Prettier (2 spaces, double quotes, trailing commas).
- **Linting:** ESLint v9 flat config (`eslint.config.mjs`). Plugins live in
  the root `devDependencies` so versions stay aligned.
- **Testing:** Vitest. Workspace tests live next to source as `*.test.ts(x)`.
- **Naming:** `PascalCase` for components/types, `camelCase` for
  functions/variables, `SCREAMING_SNAKE_CASE` for constants.
- **No product features yet.** This repo is scaffolding only.

## 3. Data Hierarchy

Two parallel hierarchies model the academic structure:

```
batch/
 └── program/
      └── sem/
           └── course/
                ├── attendance      (write: faculty | read: all)
                └── marks           (write: faculty | read: all*, lock: admin)

batch/
 └── program/
      └── sem/
           ├── gradesheet          (compiled per student, admin-locked)
           └── score/
                ├── sgpa           (per semester)
                └── cgpa           (cumulative)
```

- `course/attendance` and `course/marks` are scoped per course and written by
  the assigned faculty.
- `sem/gradesheet` and `sem/score/{sgpa, cgpa}` are derived one level up,
  aggregating all courses within that semester for a student.
- Read scoping: students see their own records; faculty see records for
  courses they teach; admin sees everything.

API routes mirror the hierarchy, e.g.:
- `GET /batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks`
- `GET /batch/:batchId/program/:programId/sem/:semId/gradesheet`

The constants `DATA_HIERARCHY` and `DATA_LEAVES` in `packages/shared` are the
canonical reference.

## 4. Roles

| Role | Permissions |
|---|---|
| **Admin** | Manage users, courses, subjects, exams, grading policy; **approve & lock** results/gradesheets; oversee audit logs. |
| **Faculty** | Write `course/attendance` and `course/marks` for assigned courses only; view class-level reports. |
| **Student** | Read own `course/attendance`, `course/marks`, `sem/gradesheet`, `sem/score/sgpa`, `sem/score/cgpa`. |

RBAC is enforced at **two layers**: Hono middleware (API) and Supabase
Row-Level Security (DB). Locking is admin-only — once a record is locked,
edits require an explicit unlock + audit entry.

## 5. Common Commands

```bash
pnpm install                       # Install all workspaces
pnpm dev                           # Run both apps in parallel
pnpm --filter @mark-matrix/api dev # API only (wrangler dev, port 8787)
pnpm --filter @mark-matrix/web dev # Web only (vite dev, port 5173)
pnpm lint && pnpm typecheck && pnpm test
pnpm check-db                      # Verify Supabase connectivity
```
EOF

# --- .env.example files -----------------------------------------------------
cat > apps/api/.env.example <<'EOF'
# Production/CI values. Copy to .env (never commit it).
# In production, prefer `wrangler secret put <NAME>` over .env.
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
EOF

cat > apps/web/.env.example <<'EOF'
# Vite env vars. Any var prefixed with VITE_ is exposed to the client.
VITE_API_ORIGIN=http://127.0.0.1:8787
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
EOF

# --- Fix App.tsx (the heredoc wrote attribute fragments inside JSX braces) -
cat > apps/web/src/App.tsx <<'EOF'
import { useEffect, useState } from "react";
import { API_ROUTES, type HealthResponse } from "@mark-matrix/shared";

export function App(): JSX.Element {
  const [status, setStatus] = useState<string>("checking…");

  useEffect(() => {
    const origin = (import.meta.env.VITE_API_ORIGIN as string | undefined) ?? "";
    fetch(`${origin}${API_ROUTES.health}`)
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((body) => setStatus(body.status))
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <main className="app">
      <h1>Mark-Matrix</h1>
      <p>
        API status: <strong>{status}</strong>
      </p>
    </main>
  );
}
EOF

# --- Wire vitest into Vite's web config & add @testing-library/react -------
node -e "const p=require('./apps/web/package.json'); p.devDependencies['@testing-library/react']='^16.1.0'; require('fs').writeFileSync('./apps/web/package.json',JSON.stringify(p,null,2)+'\n')"

echo "Done."
ls -1 eslint.config.mjs .prettierrc.json .prettierignore .github/workflows/ci.yml CLAUDE.md apps/api/.env.example apps/web/.env.example apps/web/src/App.tsx
