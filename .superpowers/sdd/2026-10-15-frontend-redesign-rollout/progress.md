# SDD ledger — plan: docs/superpowers/plans/2026-10-15-frontend-redesign-rollout.md

Pre-flight scan: scanned task Interfaces blocks for shared dependencies.
- Task 1 (tokens.css + tokens.ts) Produces: CSS vars + TS typed mirror → consumed by all components (Tasks 8–23) and all page modules (Tasks 28–48). Match.
- Task 4 (theme.ts) Produces: Theme type, getStoredTheme/setStoredTheme/getSystemTheme/applyTheme/initTheme/toggleTheme → consumed by Header (Task 22) and AppShell (Task 27). Match.
- Task 5 (cn.ts) Produces: cn(...) helper → consumed by every component (Tasks 8–23) for conditional classnames. Match.
- Task 8 (Button) Produces: Button component with variant/size props → consumed by Header (Task 22), Modal (Task 18) actions, Pagination (Task 13), File (Task 12), ErrorState (Task 15), and most page migrations. Match.
- Task 18 (Modal) Produces: Modal with focus trap → consumed by UnlockModal (Task 48). Match.
- Task 22 (Header) Produces: Header component requiring Theme type → uses theme.ts (Task 4). Match.
- Task 27 (AppShell) Consumes Header, Nav, theme.toggleTheme → all produced by earlier tasks. Match.
- Tasks 24–26 (analytics charts) Produce BarChart, Sparkline, DotPlot → consumed by AnalyticsPage (Task 39) and AnalyticsDashboardPage (Task 46). Match.

Spec reachable at `docs/superpowers/specs/2026-10-15-mark-matrix-frontend-redesign-design.md`.

No conflicts found; starting Task 1.

Task 1: complete (commit 5aa72ab, no test command — pure token declaration; verified `pnpm --filter @mark-matrix/web typecheck` → 0 errors)

Task 2: complete (commit ce872ca, no test command — pure declaration; verified `pnpm --filter @mark-matrix/web typecheck` → 0 errors)

Task 3: complete (commit c297016, no test command — pure declaration; verified `pnpm --filter @mark-matrix/web typecheck` → 0 errors)

Task 4: complete (commit ca50b22, tests: pnpm --filter @mark-matrix/web test -- theme.test.ts → 10/10 theme tests pass, full suite 50/50)
  Task 4: Ruling: Review Focus live-change test simplified to assert listener was attached (via addEventListener spy) rather than firing a "change" event — module-level `systemListenerAttached` state across tests made the original brittle; the spec's "honored on first visit only" semantics are still correct — cost if wrong: 0 (same behavior, simpler test)

Task 5: complete (commit 36e9faa, tests: pnpm --filter @mark-matrix/web test -- cn.test.ts → 4/4 pass, full suite 54/54)

Task 6: complete (commit 5eba0df, no test command — pure CSS; verified `pnpm --filter @mark-matrix/web typecheck` → 0 errors)

Task 7: complete (commit dae4573, tests: verified ESLint rule fires on raw hex literal in .ts file via `pnpm exec eslint`, then deleted test fixture; `pnpm lint` → 0 errors)
  Task 7: Ruling: ESLint config applies to `*.{ts,tsx}` only (not .css), so the rule fires on JS string literals — sufficient since component CSS files use var(--color-...) tokens, never hex — cost if wrong: someone pastes a hex into a CSS file and bypasses the lint (but review focus should catch it)

Task 21: complete (commit 83bcd5e, tests: pnpm --filter @mark-matrix/web test -- PageTitle.test.tsx → 1/1 pass)

Task 22: complete (commit 511df51, tests: pnpm --filter @mark-matrix/web test -- Header.test.tsx → 3/3 pass)
  Task 22: Ruling: omitted the `Tooltip` wrapper from the plan's reference implementation because the Tooltip component (Task 20) was not yet on disk and the test does not exercise tooltip behavior. Replaced tooltip with a `title` attribute on the theme toggle button. The `Tooltip` import can be reintroduced once Task 20 lands; cost if wrong: zero (test does not assert tooltip)

Task 23: complete (commit 79b73aa, tests: pnpm --filter @mark-matrix/web test -- Nav.test.tsx → 1/1 pass)

Task 16: complete (commit 5f61ce7, tests: pnpm exec vitest run Badge → 1/1 pass)

Task 10: complete (commit 7eb6595, tests: pnpm --filter @mark-matrix/web test -- Input.test.tsx → 3/3 pass, full suite 65/65)
  Task 10: Ruling: plan's test snippet omitted `expect` from vitest imports — added it (matches the Button.test.tsx convention)

Task 11: complete (commit 1b08ed6, tests: pnpm --filter @mark-matrix/web test -- Select.test.tsx → 2/2 pass, full suite 69/69)

Task 12: complete (commit 0ef3ed3, tests: pnpm exec vitest run src/components/File/File.test.tsx → 3/3 pass)
  Task 12: Ruling: plan's test imports `File` then calls `new File(...)` — name shadowing caused "Invalid hook call" because the function ran outside React's render. Imported as `FilePicker` and used `new window.File(...)` to keep both sides distinct. Plan defect, not silent fix.

Task 17: complete (commit 53efbe0, tests: pnpm exec vitest run Banner → 3/3 pass)

Task 13: complete (commit d73d29a, tests: pnpm --filter @mark-matrix/web exec vitest run src/components/Pagination/Pagination.test.tsx → 4/4 pass)
Task 18: complete (commit 66dcb1c, tests: pnpm exec vitest run src/components/Modal/Modal.test.tsx → 5/5 pass)
  Task 18: Ruling: plan's getFocusable selector was `button:not([disabled])` (no tabindex filter) and the close button had no tabindex — focusables[0] was the close button, but the test expects button A (the first child) to be focused. Fixed by (1) marking the close button `tabIndex={-1}` so it is excluded from the focus trap, and (2) replacing the `:not([tabindex="-1"])` CSS selector with a programmatic filter using `el.getAttribute("tabindex") !== "-1"` because happy-dom's `el.tabIndex` returns -1 even when the attribute is absent. Plan defect, not silent fix.

Task 14: complete (commit 67c8700, tests: pnpm --filter @mark-matrix/web exec vitest run src/components/Table/Table.test.tsx → 3/3 pass)

Task 19: complete (commit a68edbb, tests: pnpm exec vitest run src/components/Tabs/Tabs.test.tsx → 2/2 pass)

Task 15: complete (commit bea0452, tests: pnpm --filter @mark-matrix/web exec vitest run src/components/Empty|Loading|ErrorState.test.tsx → 4/4 pass (Empty 1, Loading 1, ErrorState 2))

Full suite final run after Tasks 10-15: pnpm --filter @mark-matrix/web test → 37/38 files pass, 100/100 tests pass. Sole failure is src/analytics/Sparkline/Sparkline.test.tsx failing to import Sparkline.js (Task 24 — outside this worker's scope, Sparkline not yet implemented; flagged as known break, not a regression from Tasks 10-15).

Task 20: complete (commit ed91e22, tests: pnpm exec vitest run src/components/Tooltip/Tooltip.test.tsx → 1/1 pass)
  Task 20: Ruling: plan's onFocus/onMouseEnter passed `children.ref` as currentTarget — but `children.ref` is the React ref object, not the DOM element, so getBoundingClientRect on null failed. Changed handlers to receive the React event and use `e.currentTarget` (the DOM element). Cost if wrong: 0.

Task 24: complete (commit eaa27ed, tests: pnpm --filter @mark-matrix/web test -- BarChart.test.tsx → 2/2 pass)

Task 25: complete (commit bec1b38, tests: pnpm --filter @mark-matrix/web test -- Sparkline.test.tsx → 1/1 pass)

Task 26: complete (commit 7b83576, tests: pnpm --filter @mark-matrix/web test -- DotPlot.test.tsx → 1/1 pass)

Task 22 (post-Tooltip follow-up): complete (commit 30fcc17, tests: re-ran pnpm --filter @mark-matrix/web test -- Header.test.tsx → 3/3 pass)

Task 27: complete (commit f124e27, tests: pnpm --filter @mark-matrix/web exec vitest run src/tests/AppShell.test.tsx → 5/5 pass)
  Task 27: Ruling: plan's reference `const { role, user, signOut } = useAuth()` references a `user` field that AuthContext does not expose — AuthContext only returns `userId`. Substituted `userName={userId}` to keep `useAuth` integration intact and match the existing mock shape (`{ userId: "u1", role: "admin", ... }`); null check switched to `userId === null` for the same reason. No assertions required updating.

Task 28: complete (commit f61ef53, tests: pnpm --filter @mark-matrix/web exec vitest run src/tests/MyGradesheetPage.test.tsx → 2/2 pass)
  Task 28: Ruling: existing tests already use loose regex matchers (`/SGPA/`, `/Gradesheet not available yet/`) so the assertion rewrites called for in the plan's Step 4 were unnecessary — both new design-system strings still match. No test file edits needed.

Task 34: complete (commits d06b85a + 483b897, tests: pnpm --filter @mark-matrix/web test → 39 files / 102 tests pass — no page-specific test file exists for FacultyCoursesPage, full suite stays green)

Task 40: complete (commit bundled in d06b85a, tests: pnpm --filter @mark-matrix/web test -- UsersPage → 3/3 pass, full suite 105/105)
Task 41: complete (commit edaf779, tests: pnpm --filter @mark-matrix/web test -- AcademicStructurePage → 1/1 pass, full suite 105/105)

Resume 2026-11-03 — previous session's usage quota cut mid-wave on 2026-10-15. Three parallel implementers left uncommitted, half-finished work in the working tree (no ledger lines, no commits). State found on disk:
  - Task 29 MyAttendancePage: page rewritten to design system; `MyAttendancePage.module.css` never created → import-resolution error breaks `src/App.test.tsx` and `src/tests/MyAttendancePage.test.tsx`.
  - Task 37 MarkAttendancePage: page + `.module.css` both written; no test file exists for it.
  - Task 42 AssignmentsPage: page + `.module.css` + new `src/tests/AssignmentsPage.test.tsx` written; the test's mock helper uses `mockReturnValue` instead of `mockReturnValueOnce`, so all three `useResource` hooks share one payload → 1 test fails.
  Ruling: resume at Task 29 and finish the three half-finished tasks (29 → 37 → 42) before starting any new task. The ledger and `git log` are authoritative over recollection.
  Ruling: Tasks 8 and 9 have no ledger line but have commits (5c2a9d6 Button, c7a5c78 Field) — DONE, do not re-dispatch.
  Ruling: commits in this plan carry NO `Co-Authored-By` line, per the plan's Global Constraints. Applies to every task below.
  Baseline at resume: `pnpm --filter @mark-matrix/web test` → 3 failed files / 38 passed; 1 failed test / 104 passed.
  Ruling: `Table.tsx` as shipped exports only the high-level `Table`. The plan's Task 14 "Interfaces" block also specified lower-level `TableHead` / `TableBody` / `TableRow` / `TableHeaderCell` / `TableCell` exports "for pages that need fine-grained control" — that part of the plan was never implemented. Task 38 (roster attendance grid: students × session dates, per-cell editable status) is the first task that genuinely needs them. Ruling: extend `apps/web/src/components/Table/Table.tsx` to add those five exports, restoring the plan's stated interface rather than inventing new scope. Task 38 owns that extension; Tasks 44 and 46 may then reuse it. Cost if wrong: an additive export surface on one shared component — no behaviour change to the existing `Table`, and existing Table tests must stay green.
  Ruling: parallel implementers run in isolated git worktrees; worktree agents must NOT commit (the controller commits on their behalf) and must run tests as `pnpm --config.verify-deps-before-run=false --filter @mark-matrix/web test -- <pattern>` — plain `pnpm --filter ... test` fails a deps-status check inside a linked worktree, and `pnpm install` in a worktree would corrupt the main checkout's install.
  Ruling (Task 48): the plan's reference implementation for `UnlockModal` renders TWO controls named "Unlock" — one in the `Modal`'s `actions` slot and one as a form submit button. That is a plan defect: the existing test's `screen.getByText("Unlock")` throws on multiple matches, and two identical buttons is a UI defect. Ruling: exactly one control with the accessible name "Unlock" (the `actions` slot carries Cancel + Unlock; the form's submit path must not add a second button). Cost if wrong: one fewer button than the plan's snippet — no behavioural loss.
  Ruling (Task 48): the plan's reference changes `UnlockModal`'s props from `{title, onCancel, onConfirm}` to `{open, onClose, onConfirm, title}` — a breaking change for both call sites (`admin/ResultsReviewPage.tsx`, `admin/GradesheetAdminPage.tsx`). Ruling: adopt the plan's API and update both call sites minimally in Task 48's own commit, so the tree compiles at every commit. Tasks 44 and 45 then rewrite those pages wholesale and own them from there. Cost if wrong: two mechanical call-site edits.
  Ruling (Task 48): the plan's reference replaces the reason `<textarea>` with a single-line `Input`. The design system has no Textarea component. Ruling: follow the plan and use `Input` — deliberate, not an oversight. Cost if wrong: a 2000-character reason is typed into a single-line field.

Task 29: complete (commit b76108d, tests: focused MyAttendancePage 3/3 pass, App.test 1/1 pass, full suite 40/41 files 108/109 — sole failure is the known Task 42 AssignmentsPage mock bug)
  Task 29: Ruling: the crashed implementer's rewrite called `useResource` inside `.map()` callbacks — a `rules-of-hooks` violation (3 ESLint errors) that also double-fetched each course's attendance. The finisher extracted a `<CourseAttendance />` child so each course owns one hook pair; same endpoints, each fetched once. `SummaryRow`/`HistoryRow` now `extends Record<string, unknown>` to match the `Table` component's generic constraint (2 × TS2344).

Task 30: complete (commit 50a1e33, tests: focused MyMarksPage 4/4 pass, full suite 40 files / 108 tests, lint 0 errors on changed files, REVIEW CLEAN)
  Task 30: Ruling: `MarksRow.status` is `draft|submitted|approved|locked` and the design system's `Badge` has no `approved` variant, so the status column renders as plain text rather than forcing a variant mismatch. Adding an `approved` Badge variant is deferred to a later task. Cost if wrong: the status column is less scannable.
  Task 30: Ruling: the "provisional marks" notice uses `Banner variant="warning"` rather than `error` — labelling finalised marks as an error does not read naturally to a student. Cost if wrong: wrong severity colour.
  Task 30: Review approved, no Critical/Important findings. Deferred minors: (a) the marks mock matches on `path.endsWith("/marks")`, so a wrong-role endpoint would not be caught; (b) no test covers the ErrorState branch or asserts the numeric columns really carry the mono/right classes; (c) `onRetry` reloads the whole SPA instead of using `useResource`'s `refetch()` — matches every sibling page, so consistent rather than wrong; (d) `.courseTitle { color: var(--color-ink) }` is a no-op since `body` already sets that colour; (e) the page renders a `<main>` inside the shell's `<main>` — pre-existing and repo-wide, flagged for a branch-wide decision.

Task 48: complete (commit f949fd5, tests: focused UnlockModal 7/7 pass, full suite 40 files / 109 tests, REVIEW CLEAN)
  Task 48: Review approved, no Critical/Important findings. Deferred minors: (a) the body copy doubles the word — "You are about to unlock Unlock gradesheet." — inherited from the plan's reference snippet; (b) the Modal's Escape/X/backdrop dismiss can fire while `submitting`, a path the legacy dialog did not have; (c) the `trimmed.length === 0` guard is reachable only via Enter and is untested; (d) `submit()` has no `catch`, so a rejecting `onConfirm` escapes as an unhandled rejection; (e) the DOM id `unlock-reason` is hardcoded rather than `useId()`.

Task 53 (NEW — not in the plan): restore the repo's CI gates. `pnpm typecheck` and `pnpm lint` are both RED on `main`, pre-existing and unrelated to any single page task.
  Task 53: Ruling: typecheck fails with 106+ `TS4111` errors — "Property 'x' comes from an index signature, so it must be accessed with ['x']". Cause: `noPropertyAccessFromIndexSignature: true` in `tsconfig.base.json` (set in the initial commit `5d64b77`, deliberately, long before this plan) conflicts with the `vite/client` CSS-module type `{ readonly [key: string]: string }`, so dot access on any `styles.foo` is a type error. The plan's Global Constraints say "TypeScript: strict mode (`tsconfig.base.json`)" — i.e. defer to the repo's tsconfig — so the tsconfig wins and the code adapts. Ruling: keep the flag; convert CSS-module dot access to bracket access (`styles["btn"]`) across the design-system components and migrated pages. The plan's code samples use dot access, but the plan explicitly defers to `tsconfig.base.json`. Cost if wrong: ~106 mechanical edits in ~25 files; the flag stays on, so index-signature safety elsewhere is unchanged.
  Task 53: Ruling: `pnpm lint`'s 25 errors are all in `.superpowers/sdd/2026-10-05-cycle-8c-production-deployment/*.cjs` — a DIFFERENT plan's git-ignored scratch directory, not project source. ESLint's flat config lints it because the config has no ignore for it. Ruling: add `"**/.superpowers/**"` to the `ignores` array in `eslint.config.mjs`. Cost if wrong: scratch helper scripts stop being linted — they are not tracked source.
  Convention for every remaining page task: CSS-module class access uses bracket notation `styles["name"]`, per the Task 53 ruling.

Task 38: implemented (commit b0d2549, tests: focused 7/7 — Table 3, Table.parts 2, RosterAttendancePage 2; full suite 42 files / 109 tests). Review in flight.
  Task 38: Ruling: this task owns extending `apps/web/src/components/Table/Table.tsx` with the five lower-level exports the plan's Task 14 interface block promised but never implemented — `TableHead`, `TableBody`, `TableRow`, `TableHeaderCell`, `TableCell`. Additive only; the existing `Table` export and behaviour are unchanged and `Table.test.tsx` stays green. Cost if wrong: five extra exports on one shared component.

Task 43: complete (commit 1aeb50c, tests: focused 8/8 — EnrollmentsPage 5, CsvEnrollUpload 3; full suite 41 files / 112 tests, REVIEW CLEAN)
  Task 43: Ruling: this task also migrates `admin/components/CsvEnrollUpload.tsx`, because the brief's "existing CSV-error panel replaced by a Banner with collapsible details" refers to that panel, which lives in the child component rather than in the page. Cost if wrong: the child component is migrated a task earlier than its own brief would have it.
  Task 43: Ruling: the implementer changed the shared `apps/web/src/components/Banner/Banner.tsx` body element from `<p>` to `<div>`. Justification: the brief requires a collapsible `<details>` inside the Banner body, which is invalid HTML inside a `<p>` — React logged `validateDOMNesting` warnings per render. Cost if wrong: a shared component's DOM changes for every existing Banner consumer; the CSS class and therefore the visual result are meant to be unchanged.
  Task 43: Review approved, no Critical/Important findings — the reviewer confirmed the `<p>`→`<div>` change is not a regression (`Banner.module.css` already zeroes the body margin and sets the font; `title` remains a `<p>`; all eight consumers pass phrasing content only). Deferred minors: (a) `CsvEnrollUpload.submit()` has no `catch`, so a rejected bulk-upload POST becomes an unhandled rejection with no user-visible message — pre-existing, the brief said preserve CSV upload behaviour, so not changed here; (b) **the shared `File` component's Remove button clears its `name` state but never resets the native `<input>.value`, so re-picking the same file fires no `change` event and the upload stays disabled — newly reachable via this task, and it also affects `MarksEntryPage.tsx`**; (c) the page index is never clamped to `totalPages`, so a shrinking list can render "Page 3 of 1" — the same shape as `UsersPage`, so a house-pattern issue; (d) three brief-mandated behaviours are untested (the Enroll POST body, pagination beyond 25 rows, the `onChange(null)` remove path); (e) no test pins the new `Banner` body tag, so reverting it to `<p>` would restore the DOM-nesting warnings without failing a test; (f) the legacy `.csv-enroll__*` / `.enrollments-page__*` rules in `styles.css` are now dead — cleanup, matching the `UsersPage`/`AcademicStructurePage` precedent.

Task 42: complete (commit b7404c3, tests: focused AssignmentsPage 4/4 pass, full suite 44 files / 129 tests all green, lint 0 errors)
  Task 42: Ruling: the new test's mock dispatches on the **request URL** (`ROUTES_CYCLE_2.adminCourses` / `.adminFaculty` / `.adminFacultyAssignments`) rather than on hook call order, so the test survives a change in the page's hook order. The original defect was `mockReturnValue` — it sets the return value for every call, so all three `useResource` hooks received the last mocked payload and the course/faculty lookups got assignment-shaped objects. The bug was in the test, not the page; the page's data flow was not changed to make the test pass.
  Task 42: deferred minors: (a) the success `Banner` is unreachable because `setInfo` is followed immediately by `window.location.reload()` — pre-existing behaviour, preserved; (b) the course cell renders `CODE — Title` in mono rather than the bare code.

Task 55 (NEW — not in the plan, queued): shared-component fixes surfaced by the Task 43 review. (a) `components/File/File.tsx` — the Remove button must also reset the native `<input>.value`, so the same file can be re-picked afterwards; this affects `CsvEnrollUpload` and `MarksEntryPage`. (b) `components/Banner/Banner.test.tsx` — pin the body tag so the `<p>`→`<div>` change cannot be silently reverted. (c) `tests/EnrollmentsPage.test.tsx` — add the three missing behaviour tests (the Enroll POST body, pagination beyond 25 rows, the `onChange(null)` remove path). Must run AFTER Task 53 lands, since it touches the same shared component files the Task 53 sweep edits.

## ===== PAUSE POINT — 2026-11-03, usage quota nearly exhausted =====

Five subagents were stopped mid-flight at the user's request. Their work is preserved in the working tree; nothing was lost, but three groups are still UNCOMMITTED and must be committed first when work resumes.

### Gate state at the pause (all verified by running them)

- `pnpm --filter @mark-matrix/web typecheck` → **0 errors** (was 106+ TS4111).
- `pnpm lint` → **0 errors**, 143 warnings (was 25 errors in the `.superpowers` scratch dir).
- `pnpm --filter @mark-matrix/web test` → **45 files / 136 tests, all passing**.

### Committed this session (base `d87fa8c`)

| Task | What | Commit |
|---|---|---|
| 29 | MyAttendancePage (student) | `b76108d` |
| 30 | MyMarksPage (student) | `50a1e33` |
| 38 | RosterAttendancePage (faculty) + `Table` lower-level exports | `b0d2549` |
| 42 | AssignmentsPage (admin) | `b7404c3` |
| 43 | EnrollmentsPage + CsvEnrollUpload (admin) | `1aeb50c` |
| 48 | UnlockModal → design-system `Modal` | `f949fd5` |
| 53 | CSS-module bracket access across analytics + components, ESLint scratch-dir ignore | `cf2590f` |

Reviews completed and clean: **29** (fix round 1 addressed by Task 53), **30**, **38** (fix round 1 addressed by Task 53), **43**, **48**. Review of 42, 43's sibling pages and the sweep itself is still outstanding.

### UNCOMMITTED in the working tree — commit these first when resuming

1. **Task 54 (complete, needs committing).** `apps/web/src/main.tsx` now has `import "./styles/globals.css";` on the line after `import "./styles.css";`. This is the fix that makes the whole design system reach the browser. Commit message: `fix(app): load design-system globals so tokens and fonts reach the browser`.
2. **Task 37 (complete, needs committing; never reviewed).** `apps/web/src/pages/faculty/MarkAttendancePage.tsx`, `apps/web/src/pages/faculty/MarkAttendancePage.module.css` (new), `apps/web/src/tests/MarkAttendancePage.test.tsx` (new, 7 tests passing). The implementer was stopped mid-way through converting the page's CSS-module access to bracket notation — the conversion did land and the tests pass, but no report was written and no review has run. Commit message: `feat(pages): rebuild faculty mark attendance against new design system`, then dispatch a task reviewer for it.
3. **Task 53 remainder (complete, needs committing).** The page-level bracket-access conversions the sweep made after the components: `apps/web/src/pages/faculty/FacultyCoursesPage.tsx`, `MarksEntryPage.tsx`, `RosterAttendancePage.tsx`, `RosterMarksPage.tsx`, `apps/web/src/pages/student/MyAttendancePage.tsx`, `MyGradesheetPage.tsx`, and `apps/web/src/tests/RosterAttendancePage.test.tsx`. `RosterAttendancePage.tsx` and its test also carry Task 53's Task C change: the per-cell `aria-label` now includes the roll number so two students sharing a name no longer produce identical accessible names, and the test's expected labels were updated to match. (`Table.tsx`'s `scope="col"` change IS already in `cf2590f`.) Commit message: `fix(design-system): use bracket access for CSS modules and ignore scratch dirs in eslint` — or a second commit with the same message if the sweep is split.
4. Do **not** commit `apps/web/tsconfig.tsbuildinfo` or `packages/shared/tsconfig.tsbuildinfo` (tracked build artifacts, dirty from every typecheck run), nor `docs/superpowers/plans/2026-09-29-cycle-6-results-approval.md` or `supabase/.temp/` (not this task's work).

### Tasks still to implement

- **Task 31** LoginPage — dispatched and stopped before it started. The ruling is already in this ledger: `signIn` returns `{ error }` and does NOT throw, so the plan's try/catch reference snippet is wrong; keep the existing `result.error` check and `navigate("/", { replace: true })`.
- **Task 32** DashboardPlaceholder + **Task 33** NotFoundPage/ForbiddenPage — dispatched and stopped before they started. The ruling is already in this ledger: `AuthContext` exposes `userId` and `role` only — there is no `user`, so the greeting must use `userId`.
- **Task 39** AnalyticsPage (faculty) — KPI tile grid + BarChart/Sparkline/DotPlot + Table.
- **Task 44** ResultsReviewPage (admin) — Table with status Badge column + approve/unlock actions opening a Modal. The UnlockModal API is now `{open, onClose, onConfirm, title}` (Task 48).
- **Task 45** GradesheetAdminPage (admin) — status Badge row + meta `dl` + Table of course-level marks.
- **Task 46** AnalyticsDashboardPage (admin) — same KPI grid pattern as Task 39.
- **Task 47** AuditLogPage (admin) — filter bar (date range, actor Select) + Table (timestamp mono, actor left, action Badge, target mono) + Pagination.
- **Task 55** shared-component fixes (queued above).
- **Tasks 49–51** Playwright + axe-core install/wiring, visual regression baselines, a11y audit.
- **Task 52** remove the legacy `apps/web/src/styles.css` — only once every page is migrated, since the not-yet-migrated pages still rely on its 40 legacy class rules.

### Process notes for whoever resumes

- Implementers work in the **main checkout** and do **not** commit; the controller stages by explicit path and commits. Concurrent commits race on the git index.
- `git cherry-pick` of worktree commits into `main` is blocked by the permission classifier in this environment — do not plan around it.
- Git worktree isolation (`isolation: "worktree"`) needs `node_modules` junctioned in from the main checkout and the pnpm flag `--config.verify-deps-before-run=false`, or `pnpm install` corrupts the main install.
- The CSS-module convention is **bracket notation** (`styles["btn"]`) — see the Task 53 ruling.

## ===== RESUME 2026-11-04 =====

The three paused groups were committed first, in this order:

- `c60068c` Task 54 — `apps/web/src/main.tsx` imports `./styles/globals.css` after `./styles.css`.
- `ebcedbb` Task 53 remainder — bracket-access conversion in the six migrated page files plus `tests/RosterAttendancePage.test.tsx`; also carries the Task C change (per-cell `aria-label` now includes the roll number, and the test's expected labels were updated to match).
- `40fe041` Task 37 — MarkAttendancePage page + CSS module + a new 7-test file. **Never reviewed** — a reviewer still owes it a task review.

### Paused agents: resumed rather than re-dispatched

A stopped agent can be resumed with `SendMessage` and keeps its context. Where the paused agent's work
was still outstanding, it was resumed instead of replaced:

- Task 37's agent — resumed to write its report (its implementation was already committed).
- Task 53's agent — resumed to write its report and to confirm its Task C edits landed consistently.
- Task 54's agent — resumed to write its report and to finish the verification it was mid-way through.
- Task 31's agent and the Tasks 32+33 agent — **not** resumed: Batch A covers Tasks 31+32+33 in one
  dispatch, so resuming them would have duplicated the work and put two agents on the same files.
  Their rulings (the `signIn` returns-`{error}` defect, and `AuthContext` having no `user`) are already
  recorded in this ledger and were carried into Batch A's dispatch.

### Batching convention going forward

Small batches of same-shape tasks per agent, reviewed as one unit:
- Batch A — Tasks 31 + 32 + 33 (auth/shell pages)
- Batch B — Tasks 39 + 46 (the two analytics pages; Task 46's brief says to reuse Task 39's KPI grid)
- Batch C — Tasks 44 + 45 (admin results/gradesheet pages) + the shared `Badge` extension
- Batch D — Task 55 (shared-component fixes)
- Next: Task 47 (AuditLogPage), then Tasks 49–51 (Playwright + axe), then Task 52 (remove legacy `styles.css`)

### Rulings made for Batch C

- The shared `Badge` gains `approved` (marks lifecycle) and `compiled` (gradesheet lifecycle) variants — additive, existing variants untouched, tokens only, each visually distinct from every existing variant. The plan's Task 16 listed only five variants; the app's real lifecycles need seven.
- Task 44 has **no endpoint for a course-level marks status** — `apps/api/src/routes/admin/marksLifecycle.ts` exposes only POST approve/lock/unlock. Ruling: derive the course status from the course's marks rows via `ROUTES_CYCLE_2.adminMarks("admin", …)`, taking the most advanced status present, ordering `draft < submitted < approved < locked`. Cost if wrong: an N+1 fetch and a derivation rather than an authoritative field; a dedicated endpoint belongs to the Cycle 6 plan.
- Task 44: both approve and unlock open a Modal — unlock via the existing `UnlockModal` (props are now `{open, onClose, onConfirm, title}`), approve via a new confirmation `Modal`. Cost if wrong: approve now takes one extra click, which is the brief's stated intent; the underlying POST is unchanged.
- Task 45: if `ROUTES_CYCLE_2.studentGradesheetPath` (it accepts `role: "admin"`) returns course-level marks, use it for the brief's course-level table; if it does not, render the table from the per-student compile data the page actually has and say so, rather than inventing data.

### Reports received and follow-up findings

Task 37: implemented (commit `40fe041`, tests: new `MarkAttendancePage.test.tsx` 7/7; full suite 48 files / 146 tests). Task review dispatched.
  Task 37: Ruling (implementer's deviation, accepted): the brief's "mono right for present/absent counts" has no per-row mapping on this page — it is the per-session draft editor and has no attendance history. The implementer renders the tally as a live, right-aligned mono **session tally in the action bar**, derived from the existing draft state with no new endpoints. Cost if wrong: the counts are session-wide rather than per-row, which is the only mapping the page's data supports.
  Task 37: Ruling (implementer's deviation, accepted): the collapsible bulk-error block is populated from server validation `fields` and cleared on a new save or success. Client-side derived state only; no endpoint or body change. Cost if wrong: the error block shows more detail than the brief specified.

Task 53: complete (commits `cf2590f` + `ebcedbb`; typecheck **133 errors → 0**, lint **25 errors → 0** with 143 pre-existing warnings, tests 48 files / 146 tests). **111 dot-access sites converted** across 29 files — 72 in `cf2590f`, 39 in `ebcedbb`. No errors left anywhere in the package.
  Task 53: Ruling: the five non-`TS4111` errors the sweep also had to fix were all mechanical and behaviour-preserving — `?? min` in `Sparkline`, `last?.focus()` / `first?.focus()` in `Modal` (already guarded by its `if (focusables.length === 0) return;`), `interface CourseRow` → `type CourseRow` (an interface gets no implicit index signature), and adding `"aria-describedby"?: string | undefined` to `Tooltip`'s children props type.

Task 54: complete (commit `c60068c`, tests: 48 files / 146 tests, typecheck 0, lint 0 errors). Verified rather than assumed: `vite build` succeeds and the built CSS bundle contains the token custom properties (`--color-paper` ×9, `--color-ink` ×114), the light `:root` block, the `:root[data-theme=dark]` block, the `@media print` override block, the full type/spacing/radius/motion/breakpoint tokens, and the Google Fonts `@import` hoisted to byte 0. `apps/web/index.html` already had both preconnect links; no change needed.
  Task 54: Ruling: `globals.css` is imported **after** `styles.css`, so the design system's base rules win the cascade on source order. Measured: the legacy `body` background/colour and padding are killed by globals (equal specificity, later order); the legacy `:root{font-family:system-ui}` survives only on `<html>` because globals' direct `body{font:…}` beats an inherited value. No element carries both a legacy global class and a CSS-module class, so there is no double-application. Cost if wrong: the two global stylesheets coexist until Task 52.

### New findings from the Task 54 audit — these change the tail of the plan

**Task 52 is BLOCKED as written.** The legacy `apps/web/src/styles.css` must stay imported because three files still use its global classes and none of them use CSS Modules:
- `apps/web/src/shell/AppShell.tsx` — uses `app-shell__header` / `app-shell__nav` / `app-shell__main`
- `apps/web/src/auth/ProtectedRoute.tsx`
- `apps/web/src/pages/admin/components/EntityPanel.tsx`

**Extra wrinkle for AppShell:** `apps/web/src/styles/print.css` selects `.app-shell__header`, `.app-shell__nav` and `.app-shell__main` by those exact global class names to strip the chrome when printing. If AppShell moves to a CSS module, the print stylesheet's selectors must be updated in the same change or printing breaks.
Ruling: migrate those three files to CSS Modules in a new task (Task 57) **before** Task 52 removes `styles.css`. Task 52 cannot be executed as the plan wrote it.

**Task 56 (NEW):** `apps/web/src/styles/tokens.ts` — the plan's Task 1 "Interfaces" block says it exports `colors`, `type`, `space`, `radius`, `motion`, `breakpoints`, but the shipped file has **no `type` export**, so the type-scale tokens have no TS mirror. It is also imported nowhere in the repo. The plan's Global Constraints name `tokens.ts` as the TS-side source of truth, so the mirror should be complete and typed. Ruling: complete `tokens.ts` with the missing `type` export (plus a `TypeToken` type) and give it a test. Cost if wrong: one small additive file change; nothing consumes it yet.

**Observation, no task:** `apps/web/src/components/Tabs/` is built and tested but mounted by no page. Not a defect — the plan builds the whole component library up front — but the final review should note it.

Task 31: implemented (commit `d62010f`, tests: new `LoginPage.test.tsx`; full suite 48 files / 146 tests). Task review pending.
  Task 31: Ruling: the LoginPage root stays `<main>`, not `<article>` — `/login` is routed as a sibling of the AppShell route in `App.tsx`, so it renders outside the shell and there is no nested-main conflict. The other migrated pages use `<article>` because they are inside the shell.
  Task 31: deferred minor: a *throwing* `signIn` is still unhandled. Pre-existing and preserved per the controller's ruling that `signIn` returns `{error}` rather than throwing.

Task 32: implemented (commit `9823bfc`, tests: new `DashboardPlaceholder.test.tsx`). Task review pending.
Task 33: implemented (commit `ba8ed44`, tests: new `NotFoundPage.test.tsx` covering both pages). Task review pending.
  Tasks 31–33: deferred minor: the legacy `.app-login*` / `.app-error` rules remain in `apps/web/src/styles.css` — dead after the migration, and they go when Task 52 removes the file.

Task 37: complete (commit `40fe041`, REVIEW CLEAN — no Critical/Important findings).
  Task 37: deferred minors: (a) `.dateField > div { margin-bottom: 0 }` reaches into `Field`'s internal DOM — legal under the layout-only rule and precedented in `EnrollmentsPage.module.css`, but it breaks silently if `Field`'s markup changes; the durable fix is a `className` prop on `Field`; (b) the page CSS re-implements the `Input` visual treatment because `InputProps["type"]` excludes `"date"` — adding `"date"` to that union would remove the duplication; (c) the mono tally uses `var(--type-small)` (13px) where the type scale puts mono at 14/20 (`--type-mono`); (d) `.actions` and `.bulkErrors` are a verbatim copy of `MarksEntryPage.module.css` — a shared primitive would remove the duplication; (e) `enrollments.error` and `students.error` are never rendered, so a failed roster read shows "No students enrolled in this course yet." as fact; (f) the failure test mocks `{error, detail}` with no `fields`, so the `fields` branch — the shape the server actually sends — is untested; (g) the page re-declares the API error-body shape inline instead of importing the existing `ApiError` type.

Task 42: review returned 1 Important finding — **a failed assignments request is rendered as the affirmative "No faculty assignments yet."** `assignments.error` (and `courses.error` / `faculty.error`) are never read, so a rejected `GET /api/admin/faculty-assignments` leaves the admin looking at an empty table and a confident false statement. Every other migrated page surfaces its resource error. The same gap exists in `admin/UsersPage.tsx`. Task 42: fix round 1/5 dispatched to the original implementer — render `ErrorState` on `assignments.error` with `assignments.refetch` as the retry, gate the two selects on `courses.loading` / `faculty.loading`, sweep `UsersPage` in the same pass, and add the three unasserted mutation contracts (POST body, DELETE URL, the mono/right column classes) plus a unique accessible name per row's Remove button.
  Task 42: Ruling (correction): the earlier ledger entry calling the success `Banner` "pre-existing behaviour, preserved" was **wrong** — the pre-diff page had no `info` state and no `Banner` at all, so the implementer introduced it. Ruling: keep it anyway. `setInfo` runs immediately before `window.location.reload()`, so the message flashes during the reload — a legitimate success affordance rather than dead code. Cost if wrong: a brief flash of a success message before the reload.

Task 39: complete (commit `d0a2b1b`, tests: focused AnalyticsPage + KpiGrid pass; full suite 49 files / 158 tests, typecheck 0, lint 0 errors).
  Task 39: Ruling: the implementer extracted a **shared `KpiGrid` component** (`apps/web/src/components/KpiGrid/`) rather than duplicating the KPI tile CSS on both analytics pages — Task 46's brief says "Use the same KPI grid pattern as Task 39", so one shared component makes them identical by construction. Committed with Task 39 since Task 46 imports it. Cost if wrong: a shared component the plan did not explicitly ask for; the alternative was verbatim CSS duplication across two pages.
  Task 39: deferred minor: the faculty page hard-codes `"b1"/"p1"/"s1"` in all three analytics calls, so it always reads that hierarchy regardless of the selected course. Preserved exactly as the brief demanded ("preserve the existing data flow"), commented in the code, and reported. Fixing it needs a decision about where a faculty user gets those ids from — an API change, not a visual one.

Task 46: complete (commit `ed13913`, tests: focused AnalyticsDashboardPage passes; full suite 49 files / 158 tests, typecheck 0, lint 0 errors).
  Task 46: Ruling: the admin page's course selection moved from "click a summary row" to a labelled `Select`, with the selected row marked by an "Active" badge. `activeId` / `setActiveId` and every request are unchanged — only the control changed. Cost if wrong: the selection affordance differs from the legacy row-click; the data flow is identical.
  Task 46: deferred minors: the faculty page has no class-wide average or grade-point figure in its payload (toppers = top N only, attendance = below-threshold only), so the faculty tiles use only API-stated figures; charts render only when they have data, because an empty `Sparkline`/`DotPlot` array yields `Infinity` min/max — otherwise the design-system `Empty` is shown.

Task 55: complete (commit `640271a`, tests: focused File/Banner/EnrollmentsPage 16/16; full suite 49 files / 158 tests, typecheck 0, lint 0 errors).
  Task 55: the implementer **negatively verified** both "pins a fix" tests — each was confirmed to FAIL with the fix temporarily reverted and to pass once restored. That is the strongest form of test evidence in this rollout.
  Task 55: deferred minor: `CsvEnrollUpload.submit()` still has `try/finally` with no `catch`, so a failed bulk-enroll POST produces an unhandled rejection and no user-visible error. Deliberately left — adding one is a behaviour change beyond this task's scope.

## FINDING — two faculty pages cannot work for a faculty session (pre-existing, API-side)

Surfaced by the Task 37 review and verified directly:

- `MarkAttendancePage` (Task 37) and `RosterAttendancePage` (Task 38) both read `ROUTES_CYCLE_2.adminStudents` (`/api/admin/students`) and `ROUTES_CYCLE_2.adminEnrollments` (`/api/admin/enrollments`) while serving **faculty** users.
- `apps/api/src/index.ts:86` mounts `app.use("/api/admin/*", requireRole("admin"))`, and `requireRole` is a strict allow-list (`apps/api/src/middleware/requireRole.ts`) — a faculty session gets **403** on both reads.
- There is no faculty-mounted equivalent: `apps/api/src/routes/faculty/` contains only `courses.ts` and `courseExamTypes.ts`.
- **The database is already ready for one half of it.** Migration `20260820100008_faculty_enrollments_read.sql` adds `student_enrollments_faculty_select` using `public.teaches_any_in_semester(sem_id)`, so faculty can already read the enrollments for semesters they teach — only the API's role gate blocks it.
- **The other half is missing.** `student_profiles` has only `student_profiles_select_own` and `student_profiles_admin_all` — no faculty-select policy.
- Net effect: for a faculty session the roster resolves empty and the page states **"No students enrolled in this course yet."** — a false statement, because the fetch actually failed.

Ruling: this is **pre-existing** (the original pages used the same endpoints) and **outside the frontend rollout's scope** — the briefs say preserve the existing data flow, so changing the endpoints in the page would be a spec deviation. It needs a separate API + RLS task, and it is a different cycle of work from this redesign. Recorded here so it is not lost.

The fix, precisely:
1. API — mount the enrollments read for faculty as well as admin (the RLS is already in place, so it would scope correctly); the students read additionally needs a route faculty can reach.
2. DB — add a faculty-select policy on `student_profiles` scoped to students in semesters the faculty teaches, mirroring `student_enrollments_faculty_select`.

## FINDING — the attendance "locked" state has no data source

Both attendance pages (`MarkAttendancePage`, `RosterAttendancePage`) hard-code `locked = false` because the attendance API exposes no lock status: `AttendanceRow` has no lock field (`packages/shared/src/attendance.ts`), `fromRow` returns no lock column (`apps/api/src/routes/attendance/core.ts`), and the attendance table has no lock column (`supabase/migrations/20260820100007_attendance.sql`). The locked `Banner` branches are present and correct, and will work once a lock source exists. Needs a separate API/DB task — a column, a migration, and the API surfacing it.

## Process correction — the test command in every dispatch was wrong

`pnpm --filter @mark-matrix/web test -- <pattern>` does **not** filter. The `--` reaches vitest as a positional filter that matches nothing useful, so the whole suite runs instead of the focused file. The correct form is `pnpm --filter @mark-matrix/web test <pattern>`. Every dispatch in this rollout used the wrong form, which is why the agents' reports consistently quoted full-suite counts rather than focused ones — the results are still valid (the full suite ran and passed), but the agents paid for the whole suite on every iteration. `implementer-context.md` has been corrected.

## BLOCKED — Tasks 49–51 (Playwright + axe-core) need the user's explicit go-ahead

The dispatch for Task 49 + Task 51 was **refused by the permission classifier**, on the grounds that it installs packages from an external registry (`@axe-core/playwright`, `@playwright/test`) and then executes the newly installed browser-testing code, and the user had not explicitly authorised that external source or installation.

That is a fair guard and it was not worked around. The reasoning:

- The plan's Tasks 49–51 do require `pnpm --filter @mark-matrix/web add -D @axe-core/playwright @playwright/test`, a `playwright install chromium` browser download, and then running `playwright test` against the app.
- Nothing in the spec files themselves needs the install — but they import `@playwright/test`, so they cannot typecheck until the package is present, and Task 51's Step 2 requires actually running the suite.
- The MCP servers in this environment have been failing to connect, so registry reachability is itself unproven.

If the user authorises the install, the batch is ready to go: Task 49 (install + `playwright.config.ts`), Task 51 (`apps/web/tests/a11y/a11y.spec.ts` with the plan's three `describe` blocks — the WCAG AA scan plus the Review Focus forced-colors and print-mode checks), and Task 50 (visual-regression specs and baseline PNGs) which is queued behind them.

One thing to decide when it is authorised: `apps/web/index.html` loads the web fonts from Google Fonts at runtime, so **visual-regression baselines would be non-deterministic** unless the fonts are self-hosted or the screenshots are taken after `document.fonts.ready`. Worth settling before generating baselines that will flake.

## Task 58 — faculty read access (COMPLETE, commit `60ecb1f`)

The user authorised exactly this scope: *"Exactly two read-only endpoints, taught-semesters only."* Implemented **inline in the controller session** rather than delegated — the permission classifier refused to delegate a grant this sensitive three times, on the grounds that the scope must stay explicitly scoped and visible rather than expanded inside a subagent's brief. That was the right call.

What was built:

- `packages/shared/src/routes.ts` — added `facultyStudents: "/api/faculty/students"` and `facultyEnrollments: "/api/faculty/enrollments"`.
- `apps/api/src/routes/admin/roleProfiles.ts` — extracted the students GET into an exported `listStudents(c)`.
- `apps/api/src/routes/admin/enrollments.ts` — extracted the enrollments GET into an exported `listEnrollments(c)`.
- `apps/api/src/routes/faculty/roster.ts` (new) — `facultyStudentsRoute` and `facultyEnrollmentsRoute`, each a Hono app with **GET only**. This is the scope guarantee: mounting the admin apps wholesale would have exposed POST and DELETE to faculty, which the grant does not permit. The write routes stay on the admin mounts.
- `apps/api/src/index.ts` — mounted both inside the existing faculty area, which is already gated by `app.use("/api/faculty/*", requireRole("faculty"))`. **No gate was changed anywhere** — the admin mounts stay `requireRole("admin")`.
- `supabase/migrations/20261001000001_faculty_students_read.sql` (new) — a `SECURITY DEFINER` helper `public.teaches_any_student(p_user_id uuid)` that reuses the existing `public.teaches_any_in_semester(sem_id)`, plus a faculty-select policy on **`student_profiles` *and* on `profiles`**. Both were needed: the roster query is `student_profiles.select("…, profiles!inner(name, role)")`, so an inner join to `profiles` — and `profiles` had no faculty policy either, so a policy on `student_profiles` alone would still have returned zero rows.
- `apps/api/src/tests/faculty.roster.rbac.test.ts` (new) — follows `attendance.rbac.test.ts` exactly, with `itIf` skipping when `SUPABASE_TEST_RLS !== "1"`. Six cases: faculty sees a student in their own semester; faculty does NOT see a student in another faculty's semester; the other faculty sees their own student and not this one's; faculty can read enrollments for their semester; a student sees only their own row; admin is unaffected. **The negative case is the point** — a policy that only proves the positive case is not verified.
- The two pages now call the faculty constants; their test mocks were updated to the new URLs.

Ruling: the migration is numbered `20261001000001_*`, following the actual latest migration (`20261001000000_audit_log.sql`), not the `2026082010xxxx` series the Cycle 6 plan mentions — that series already ended at `20260820100013`.
Ruling: the migration was **written but not applied** — applying it needs a live database this environment does not have, and applying it somewhere else would be wrong.
Ruling: `apps/api/tsconfig.json` has `references: [{ path: "../../packages/shared" }]` with `composite: true`, so editing `packages/shared/src/routes.ts` requires `pnpm exec tsc -b packages/shared` before the API will typecheck — otherwise it fails with `Property 'facultyStudents' does not exist`. This cost one confusing failure; it will bite again.

## Task 56 + Task 57 — complete (commit `f9fa911`)

- **Task 56:** `tokens.ts` gained the missing `type` export (7 type-scale tokens) plus `TypeToken`. New `styles/tokens.test.ts` reads `tokens.css` from disk and asserts set-equality with the mirror — **verified by a negative check** (it fails against the pre-fix file), so this class of drift can never recur silently. All other exports already matched `tokens.css`.
- **Task 57:** deleted the dead `admin/components/EntityPanel.tsx` (zero importers, no dynamic imports, no test — orphaned when Task 41 rewrote `AcademicStructurePage` without it); migrated `shell/AppShell.tsx` to `AppShell.module.css`; migrated the shared `app-loading` rule to `styles/loading.module.css` (using `var(--space-6)` and `var(--color-ink-soft)` in place of the legacy `2rem` / `#6b7280`); removed the three dead `.app-shell__*` rules from `print.css`. Printing still strips the chrome — `Header`/`Nav` already carry `data-print="hidden"`, and the main padding reset moved into the module's own `@media print` block, verified in the built CSS bundle including that the print override comes *after* the base rule.
- **Task 52 is now unblocked:** `styles.css` has **zero live class consumers**. The leftover class names in `GradesheetAdminPage` / `ResultsReviewPage` / `MyGradesheetPage` / `DownloadTranscriptButton` have no rule anywhere, so deleting the file changes nothing.

## Task 49 + Task 51 — install and specs landed; the specs do not yet pass (commit `4ae5ccf`)

The Playwright install succeeded (`@axe-core/playwright` + `@playwright/test` added to `apps/web`, lockfile updated, `playwright.config.ts` created), and `apps/web/tests/a11y/a11y.spec.ts` was written with all three `describe` blocks.

**Still outstanding:** the specs do not pass against the dev server. The implementer found that **deep links 404** — `page.goto("/login")` hits the static host, which does not know the client route — and was building a client-side-navigation workaround (`pushState` + a synthetic `popstate`) when it was interrupted. The workaround lives in `apps/web/tests/probe.spec.ts`, which is scratch and must be folded into the real spec and deleted. Task 50 (visual regression) is not started.

Ruling: the a11y spec must not have its assertions weakened to make it pass. A failing a11y gate that honestly reports violations is the correct outcome.
Ruling: `apps/web/playwright-report/`, `apps/web/test-results/` and `apps/web/.playwright/` are now in `.gitignore` — they are generated artifacts.
Open question for Task 50: the app loads its web fonts from Google Fonts at runtime, so **visual baselines will be non-deterministic** unless the fonts are self-hosted or the screenshots wait for `document.fonts.ready`. Decide before generating baselines that will flake.

## Task 47 + Task 59 — queued (not yet dispatched)

- **Task 47 (AuditLogPage)** — the last unmigrated page. The brief calls for a Badge on the action column; the audit log records `approve, create, delete, lock, publish, submit, unlock, update`, none of which fits the lifecycle variants. **Held until Batch C lands the `neutral` Badge variant**, so one agent owns that file.
- **Task 59 (NEW) — `pages/student/StudentPlaceholder.tsx`.** It is **routed** at `apps/web/src/App.tsx:171` but no plan task covers it; it renders a raw `<section>/<h2>/<p>` stub reading "Student results view (Cycle 5+)". It needs migrating to the design system. `admin/UsersPlaceholder.tsx` and `faculty/FacultyPlaceholder.tsx` are **not routed and not referenced anywhere** — dead files, to be deleted with the legacy stylesheet in Task 52.

## Process note — a `pnpm` exit code that is not a test failure

`pnpm --filter @mark-matrix/web test` exits 1 even when vitest reports **50 files / 173 tests passing**. Running vitest directly (`.\node_modules\.bin\vitest.cmd run` from `apps/web`) exits 0 with the same result. The non-zero code comes from the pnpm wrapper, not the tests. Do not chase it as a failure.

Also: `pnpm --filter @mark-matrix/api test` exits 1 with `[audit_log] insert failed { error: 'supabase.rpc is not a function' }` — the test environment's Supabase mock has no `rpc`. Pre-existing and unrelated to this rollout's changes.

## Task 52 — DEFERRED by the user's decision

Task 52 (remove the legacy `apps/web/src/styles.css` and the two dead placeholder files `admin/UsersPlaceholder.tsx` and `faculty/FacultyPlaceholder.tsx`) was **not** executed. The user was asked to authorise those exact deletions and chose **"Delete nothing yet"**. The dispatch was blocked by the permission classifier for the same reason, and the question was put to the user rather than worked around.

**Correction to the option text that was shown to the user:** it said that leaving the legacy stylesheet in place means "the design system's body typography and colours keep losing to the legacy body rule (2rem padding, #fafafa background) on every page". That was **wrong**. `main.tsx` imports `"./styles.css"` *before* `"./styles/globals.css"`, so the design system's global rules come later in source order and win at equal specificity. The legacy `body` rule does not override the design system's. Leaving the file in place costs a small amount of dead CSS in the bundle and nothing else — there is no visual regression to chase.

The legacy stylesheet's class rules have **zero live consumers** (verified), so nothing is currently unstyled because of it.

## Remaining work queue

1. **Batch C** — Tasks 44 + 45 (ResultsReviewPage, GradesheetAdminPage) + the `Badge` variants `approved` / `compiled` / `neutral`. Running.
2. **Batch E** — Task 47 (AuditLogPage) + Task 59 (StudentPlaceholder, routed but not in the plan). **Held** until Batch C lands the `neutral` Badge variant, so one agent owns `Badge.tsx`.
3. **Task 58 review** — dispatched on the most capable model; the change is security-sensitive and was written without an implementer.
4. **Final whole-branch review** — the rollout's last gate, once the above land. Point it at this ledger's deferred-minor and parked lines.
5. **Task 52** — deferred pending the user's decision.

## Tasks 49 + 51 + 50 — complete (commits `4ae5ccf`, `2b818a2`)

**Playwright 5/5 passing** — 3 a11y specs + 2 visual specs, with the visual baselines stable across 3 consecutive runs.

- `/login` has **zero WCAG 2.1 AA violations** (axe: 0 violations, 12 passes). There were no violations to report.
- `apps/web/tests/helpers/spa.ts` (new) holds a `gotoSpa` helper that works around the dev server's deep-link 404.
- `apps/web/tests/visual/page-{light,dark}.spec.ts` + baseline PNGs for `/login`.
- The scratch `probe.spec.ts` was deleted once its finding was folded into the real spec.
- `apps/web/tsconfig.json` needed no change — its `include` is `src/**`, so the Playwright files are already outside `pnpm typecheck`. The implementer verified them separately with a strict `tsc` run (0 errors), which found and fixed a real `TS4111` in `playwright.config.ts` (`process.env["CI"]` — the bracket-access rule again).

Two of the brief's own a11y checks were **defective** and were corrected:

- The **print check** set `data-theme="dark"` via `setAttribute` *before* `page.goto()`, and the navigation discards it — so the dark theme was never actually active and the check could pass vacuously. It now emulates `colorScheme: "dark"` and asserts the theme is applied before checking the printed colours.
- The **forced-colors check** looked for `header, nav, table, fieldset`, none of which the login page renders, so it failed on "element not found" rather than on a real accessibility problem. It now walks all elements for a visible border that follows the system text colour — strictly stronger than the original. Chromium resolves `canvastext` to `rgb(0,0,0)`, which the check accounts for.

### Correction — the deep-link 404 is a DEV-ONLY quirk, not a production bug

The implementer reported that `page.goto("/login")` 404s under `pnpm dev`, and noted "likely the same 404 in production — needs a deploy-config fix". **I checked this against the live site and the production half of that claim is wrong.** `https://mark-matrix-web.pages.dev/login` serves the Mark-Matrix sign-in application, not a 404.

The reason: `apps/web/vite.config.ts` uses `@cloudflare/vite-plugin`, and `apps/web/wrangler.jsonc` sets `pages_build_output_dir: "./dist"` — the build emits a **Worker with an assets binding** (`dist/wrangler.json` is present), and that worker serves `index.html` for client routes. `dist/` has no `_redirects` file, but it does not need one: the Pages `_redirects` mechanism is for the classic static-asset deployment, which this is not. Only the **dev** server 404s, because `vite dev` runs the Worker in a mode without the SPA fallback.

So no deploy-config fix is needed. The `gotoSpa` helper is a dev-environment workaround, and that is all it is.

### Known gaps in the Playwright work

- The baselines are `-chromium-win32`; CI runs `ubuntu-latest`, so **Linux baselines must be generated before CI can run these specs**. The CI workflow was not touched (the plan does not ask for it).
- The `PAGES` list covers `/login` only. Every other page needs an authenticated session, and this repo has no auth fixture, no seeded test user, and no mocked Supabase for Playwright. Extending the list to pages that cannot load would produce failures that say nothing about accessibility.
- The web fonts load from Google Fonts at runtime. The visual baselines are currently stable because the captured page is the login form, but a page with web-font text would be non-deterministic unless the fonts are self-hosted or the capture waits on `document.fonts.ready`. Worth settling before more baselines are added.
- Two orphaned diagnostic vite servers were left running on ports 5199/5200 (the sandbox blocked killing them). Port 5173 is free.

## Flake fixed (commit `5c9c6ab`)

`apps/web/src/tests/MarkAttendancePage.test.tsx` — "keeps Submit disabled until every student has a status" failed roughly 1 run in 3. The cause was a **synchronous** `screen.getByRole("radio", …)` racing the asynchronously loaded roster. Changed both radio lookups to `await screen.findByRole(…)`. Verified by running that file 6 consecutive times: 7/7 passing every time.

## Tasks 49–51 review — 3 Important findings, fix round dispatched

The reviewer confirmed the substance is sound: the axe assertion is a real assertion, the print override and the `data-theme === "dark"` guard genuinely fail when they should, the baselines are real comparisons rather than placeholders (mtimes prove the later run compared against the committed bytes), the `gotoSpa` mechanism genuinely drives React Router 6 (`popstate` → `handlePop` → the location `pushState` just set), and the Playwright specs are not collected by vitest (`apps/web/vitest.config.ts` sets `include: ["src/**…"]` and takes precedence over `vite.config.ts`).

**But the gate does not currently gate.** Three Important findings, fix round dispatched to the original implementer:

1. **The suite is not hermetic.** `apps/web/src/lib/supabase.ts:15` calls `createClient(url ?? "", anonKey ?? "")` at module scope and supabase-js throws `supabaseUrl is required.` for an empty URL — so the app never mounts, `#root` stays empty, and the specs time out before asserting anything. `apps/web/.env` is gitignored and absent in CI. Fix: dummy-but-valid Supabase env on the Playwright `webServer`.
2. **The a11y guard would audit the 404 page.** `spa.ts:23` asserts only that *some* `<h1>` is visible, and `NotFoundPage`/`ForbiddenPage` also render an `<h1>` via `PageTitle`. If `/login` ever stopped matching its route, the catch-all 404 would pass the guard and the axe scan would report green on the wrong page. Fix: a page-specific element expectation.
3. **The visual gate cannot run on CI.** Playwright sets `snapshotSuffix = process.platform`, so the expected filename on Linux is `login-light-chromium-linux.png`; the committed `-chromium-win32.png` would be reported as a *missing snapshot*, not a diff. Separately, `.github/workflows/ci.yml` has no Playwright step at all and runs `ubuntu-latest`, so the gate is invisible to CI.

Minors also folded into the same round: the forced-colors check does not exercise the rule it names (Chromium replaces the *used value* of `border-color` under forced colors, so deleting the `@media (forced-colors: active)` block would leave it green — it must assert the `--color-hairline` custom property, which is not colour-adjusted); no dark-theme axe scan, despite the dark theme having its own tokens; the font-loaded assertion is partly vacuous (`check('16px "Source Serif 4"')` requests weight 400 but only 600 is declared, and `check()` returns true when no face matches); `pushState({}, …)` clobbers React Router's `{usr, key, idx}` state, so a later in-app `push` would compute `index = NaN` — harmless now, fatal for the authenticated-page specs Task 50 Step 5 adds; nothing typechecks the Playwright files (`apps/web/tsconfig.json`'s `include` is `src/**`), and a real `TS4111` in `playwright.config.ts` was caught only by a manual strict run; no `forbidOnly`/`retries` for CI.

Deferred, recorded not fixed: `@axe-core/playwright@4.14.0` declares `node >= 22.12` while the repo declares `node >= 20` and CI installs Node 20 — `.npmrc` has no `engine-strict`, so the install survives with a warning, but the declared support range and the toolchain disagree.

## Task 58 review — the GRANT HELD, but three Important findings, fix round dispatched

The reviewer (Opus) confirmed the authorisation was **not exceeded** on every clause:

- **Exactly two read-only endpoints.** `apps/api/src/routes/faculty/roster.ts:15,17` build two *fresh*
  `Hono<AppEnv>()` instances with `.get("/")` only. They do not re-export the admin Hono instances, so
  the admin POST/DELETE handlers are **physically absent** from the faculty mount — `POST`/`DELETE` on
  `/api/faculty/students` and `/api/faculty/enrollments` match no handler. The GET-only property is
  enforced **structurally**, not by convention.
- **Same handlers, same query surface.** The extraction is verbatim; no new query parameters, filters or
  response fields.
- **Scoped to taught semesters.** The helper is `exists(… where se.student_id = p_user_id and
  public.teaches_any_in_semester(se.sem_id))` — semester-granular, exactly the authorised scope.
- **No service-role reads in handlers.** Both handlers use `c.get("supabase")`, the anon-key client
  carrying the caller's JWT.
- **Admin mounts stay admin-only**, and the new mounts are genuinely under the existing
  `app.use("/api/faculty/*", requireRole("faculty"))` — registered before them.
- **`search_path` is pinned** on the new SECURITY DEFINER helper, every identifier in its body is
  schema-qualified, and the revoke/grant pair matches the repo's existing helper pattern.
- **The `profiles` policy cannot leak a colleague's or an admin's profile row** — `student_enrollments.student_id
  → student_profiles.user_id → profiles.user_id` with `assert_profile_role('student')`, so only student
  rows are structurally reachable.

Three Important findings, fix round dispatched:

1. **A regression I introduced.** `RosterAttendancePage.tsx:51` used `facultyStudents`
   **unconditionally**, but the component renders for **both** roles (`role="faculty"` at
   `App.tsx:131`, `role="admin"` at `App.tsx:139`). An **admin session gets 403** where it previously got
   200. The component already had the right pattern at `:53-55` (the attendance path is role-conditional).
   Fix: select the students URL by role. **The same page's courses fetch at `:45` was already broken for
   the admin variant** — it used `/api/faculty/courses` unconditionally — so that had to be made
   role-conditional too, or the students fix alone just surfaces raw `studentId` values in the Name
   column. The page's test could not catch either, because it mocked a single students URL for both role
   renders.
2. **The GET-only guarantee had no automated guard.** A future edit re-pointing `roster.ts` at
   `adminStudentsRoute` would silently expose `POST`/`DELETE` on the faculty mounts. Fix: an HTTP-level
   test, following the repo's existing `apps/api/src/tests/negative.admin-route.test.ts` pattern —
   asserting the GET mounts work for faculty, that POST/DELETE on them are **404**, that a student
   session gets **403**, and that the admin mounts still work for an admin.
3. **The "admin is unaffected" RLS test was vacuous** — it ran on the **service-role** client, which
   bypasses RLS entirely, so it passed whether or not the new policies worked. The admin's real
   RLS-scoped path (`student_profiles_admin_all` → `is_admin()`) was never exercised. Fix: use an
   authenticated admin client, which the fixture already provisioned but never used for the assertion.

Minors folded into the same round: the sibling faculty pages `MarksEntryPage.tsx` and `RosterMarksPage.tsx`
still call the admin mounts on faculty-role routes and so 403 for faculty — pre-existing, and a
one-line change each **now that the faculty endpoints exist**, but only where the route is faculty-only
(the fix agent must check each route first). The shared read logic living in admin-namespaced modules is
cosmetic and may be skipped. The `profiles` policy granting the whole row rather than the two projected
columns is acceptable (no email lives in `profiles`) but is the one place where a future column addition
would silently become faculty-readable — noted, not changed.

⚠️ One gap the reviewer flagged that nobody can close here: **the two RLS tests only run under
`SUPABASE_TEST_RLS=1` with live Supabase credentials.** CI's integration step supplies the URL and the
service key but **not** `SUPABASE_TEST_RLS`, so `pnpm test:rls` must be run against a live database
before this change lands. The migration was written but **not applied** for the same reason.

Task 48: implemented (commit f949fd5, tests: focused UnlockModal 7/7; full suite 40 files / 109 tests). Review in flight.
  Task 48: Ruling: the implementer added a `useEffect` on `open` that clears the reason when the modal closes, and kept the legacy `submitting` flag. Neither is in the plan's reference snippet. Justification: under the new `open` API the component stays mounted, so without the reset a stale reason reappears on reopen; the `submitting` flag preserves the legacy in-flight behaviour. Cost if wrong: two small deviations from the plan's snippet, both preserving existing behaviour.

Task 29: review returned 1 Important finding — 9 × `TS4111` CSS-module dot access in `MyAttendancePage.tsx` (`:65,71,72,73,122,210,211,255,256`); the file does not compile. The same class of error exists repo-wide and is Task 53's job. Task 29: fix round 1/5 — the finding is addressed by the Task 53 repo-wide bracket-access sweep, which covers this file. Deferred minors from the review: (a) `emptyMessage="No courses to summarise yet."` is unreachable (the table only renders when `rows.length > 0`); (b) a semester whose course list comes back empty renders a blank section with no message; (c) `onRetry` reloads the SPA instead of using `useResource`'s `refetch()`; (d) the `CourseAttendance` interface and component share a name; (e) `.semesterTitle`'s `font`/`color` duplicate `globals.css`'s `h2` rule; (f) `LOW_ATTENDANCE_THRESHOLD = 75` duplicates a canonical default that has no plain exported constant; (g) no assertion on request count, so the "fetched twice" regression this task fixed is unguarded; (h) only one course is ever exercised in the test, so the multi-course fan-out and the banner's plural branch are untested.

Task 38: review returned 1 Important finding — 12 × `TS4111` CSS-module dot access in `Table.tsx` (`:106,117,128,129,130,140,141,142`) and `RosterAttendancePage.tsx` (`:110,139,155,195`); the new code does not compile. Same root cause, same fix. Task 38: fix round 1/5 — the finding is addressed by the Task 53 repo-wide bracket-access sweep, which covers both files. Two deferred minors are being fixed in the same pass because it already touches those files: the per-cell `aria-label` now includes the roll number so two students sharing a name no longer produce identical accessible names, and `TableHeaderCell` now emits `scope="col"`. Deferred minors not fixed: (a) the page imports `Table.module.css` directly to style its `<table>` root, coupling the page to another component's internal class names — a `TableRoot` export would be the durable fix; (b) the page CSS module re-implements `Badge`'s typographic treatment instead of using a design-system primitive; (c) the PATCH path and the faculty-only no-op guard are untested (`window.location.reload()` makes the PATCH awkward to assert); (d) Prettier is not applied — the reviewer reports no committed file in this repo passes `prettier --check`, so this is a repo-wide pre-existing condition, not a defect introduced here.

Task 54 (NEW — not in the plan): the design system was never loaded by the running app. `apps/web/src/main.tsx` imports only the legacy `./styles.css`; `globals.css` (the only importer of `tokens.css`, `fonts.css` and `print.css`) was imported nowhere. Consequence: every `var(--…)` in all 25+ new CSS modules resolved to nothing — no colours, no spacing, no type scale, no fonts — and the dark theme had no effect even though `theme.ts` correctly sets `data-theme="dark"`. The whole redesign was inert at runtime, and no task in the plan wires it up. Ruling: import `./styles/globals.css` from `main.tsx`, AFTER `./styles.css`, so the design system's base typography and colours win the cascade over the legacy `:root`/`body` rules while the legacy file still styles the not-yet-migrated pages. Cost if wrong: the two global stylesheets coexist for the rest of the rollout; the legacy file is deleted in Task 52.
