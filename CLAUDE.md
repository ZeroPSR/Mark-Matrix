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
