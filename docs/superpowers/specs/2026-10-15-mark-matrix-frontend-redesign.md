# Mark-Matrix Frontend Redesign — Design Spec

**Date:** 2026-10-15
**Status:** Awaiting user review
**Owner:** Pranit
**Repo path:** `apps/web/`

## 1. Context & goals

The Mark-Matrix frontend currently uses ad-hoc plain CSS with BEM-style class names in a single `styles.css`, system fonts, a flat gray palette, and a horizontal top nav. Pages are functionally complete but visually minimal: most tables and forms have no real typography hierarchy, no status badges, no theme support, and no consistent density rules.

This spec establishes a **distinctive editorial-institutional design system** for the web app — paper/ink palette, serif display headings, monospace numbers, ruled-hairline tables — and applies it across every page. The system ships a typed token layer, a component library built on CSS Modules, light and dark themes, and the page templates that compose them.

The goals, in priority order:

1. The app should look and feel like a credible academic registry, not generic admin software.
3. Every page renders correctly in **light** and **dark** as first-class themes.
3. All interactive components hit **WCAG 2.1 AA**.
4. The system can be extended without rewriting pages (typed tokens, scoped styles).
5. Existing functionality, route paths, and role-based access are unchanged.

## 2. Scope & non-goals

**In scope**

- Design system: tokens, components, page templates, theming.
- Rebuild of the `AppShell` (Header + Nav).
- Rebuild of every page in `apps/web/src/pages/`, every modal in `apps/web/src/components/`.
- New analytics charts (inline SVG, no library).
- Print stylesheet for gradesheets and transcripts.
- CI gates for visual regression and accessibility.

**Out of scope**

- Any backend, API, or Supabase changes.
- Any data model, RBAC, or RLS changes.
- Refactoring React state management (hooks, contexts) — components stay where they are unless changes are needed for the design.
- Adding icon libraries, illustration sets, or photo/imagery assets.
- Internationalisation beyond Latin-script support.
- New user-facing features.
- Mobile-first redesign (this is desktop-first with a graceful mobile fallback for student pages only).

## 3. Design direction — Editorial institutional

Quiet, high-trust feel. The app reads as an academic registry, not a SaaS dashboard.

- **Headers in serif, body in sans, numbers in monospace.** No mixing within a paragraph.
- **Paper-white background, near-black ink, one quiet blue accent.**
- **Ruled hairlines, not boxes.** Tables and cards use 1px hairline borders; form fields are borderless with a single bottom underline.
- **Generous row height, left-aligned text, right-aligned numbers.**
- **Medium-high density.** Editorial registries are information-rich by design.

Reference feel: FT, NYT data journalism; government/academic registries that are actually usable. Distinct from Material, shadcn, Tailwind UI defaults.

## 4. Foundations

### 4.1 Palette (light / "paper")

| Token | Value | Use |
|---|---|---|
| `--color-paper` | `#F7F4ED` | Page background (warm off-white, not pure white) |
| `--color-ink` | `#1A1817` | Primary text (near-black with warm undertone) |
| `--color-ink-soft` | `#4A4640` | Secondary text, captions |
| `--color-hairline` | `#E5E0D5` | 1px table rules, dividers, input underlines |
| `--color-surface` | `#FFFFFF` | Cards, table headers, raised content |
| `--color-surface-sunk` | `#F2EEE5` | Alternating table rows, muted panels |
| `--color-ink-blue` | `#1B3F7E` | Primary action, links, focus rings (Oxford blue) |
| `--color-success` | `#2F6F4E` | Quiet green for "submitted" / "published" |
| `--color-warning` | `#B07A1A` | Amber for "draft" / "needs attention" |
| `--color-error` | `#8E2A2A` | Academic red — not bright |

### 4.2 Palette (dark / "charcoal & paper-inverse")

Dark is **its own restyle**, not inverted paper.

| Token | Value | Use |
|---|---|---|
| `--color-paper` | `#18161A` | Page background (charcoal) |
| `--color-ink` | `#E8E2D6` | Primary text (cream, inverse of ink) |
| `--color-ink-soft` | `#B0A89C` | Secondary text, captions |
| `--color-hairline` | `#2F2C36` | 1px rules, dividers (just-visible on charcoal) |
| `--color-surface` | `#232128` | Cards, table headers |
| `--color-surface-sunk` | `#14131A` | Alternating table rows |
| `--color-ink-blue` | `#6E9BD1` | Primary action (lighter blue for 4.5:1 on charcoal) |
| `--color-success` | `#6FB38A` | Quiet green for confirmed states |
| `--color-warning` | `#D4A45A` | Amber |
| `--color-error` | `#E08585` | Soft red |
| `--color-backdrop` | light: `color-mix(in srgb, var(--color-ink) 40%, transparent)` / dark: `color-mix(in srgb, #000 70%, transparent)` | Modal backdrop. Always a darkening overlay over the current page bg. |

Both palettes hit **WCAG 2.1 AA** on body text, large text, and UI components.

### 4.3 Typography

Loaded from Google Fonts with preconnect, weights 400 and 600 only, Latin subset only, `font-display: swap`.

| Role | Family | Weight | Use |
|---|---|---|---|
| Display / headings | Source Serif 4 | 600 | Page titles, section heads, card titles |
| Body | IBM Plex Sans | 400 / 600 | Paragraphs, labels, buttons, navigation |
| Mono / numerals | IBM Plex Mono | 400 | All numbers in tables, IDs, marks |

Fallbacks: `system serif`, `system sans-serif`, `system monospace`.

### 4.4 Type scale (8pt grid, modular scale 1.25)

| Token | Size / line-height | Family | Weight | Use |
|---|---|---|---|---|
| `--type-display` | 32 / 40 | Source Serif 4 | 600 | Page heroes |
| `--type-h1` | 24 / 32 | Source Serif 4 | 600 | Section heads |
| `--type-h2` | 20 / 28 | Source Serif 4 | 600 | Card titles |
| `--type-h3` | 16 / 24 | IBM Plex Sans | 600 | Sub-sections |
| `--type-body` | 15 / 24 | IBM Plex Sans | 400 | Paragraphs, list rows |
| `--type-small` | 13 / 20 | IBM Plex Sans | 400 | Captions, helper text |
| `--type-mono` | 14 / 20 | IBM Plex Mono | 400 | Tables, marks, IDs |

Letter-spacing: +0.04em on `--type-small` when used uppercase (badges, eyebrows).

### 4.5 Spacing, radius, elevation, motion, breakpoints

```
Spacing scale (8px base):  4  8  12  16  24  32  48  64  96
Radius:                    0 for fields, tables, cards
                           2px on small badges / pills
                           4px max on buttons
Elevation:                 one level only — soft 1px hairline border, no drop-shadows
                           exception: modal uses a 4-stop subtle vignette
Motion:                    100ms ease-out for hover/focus only
                           no transitions on page mount or data arrival
                           prefers-reduced-motion → all transitions 0
Breakpoints:               sm  < 640     cards only (student mobile)
                           md  640–1024  condensed tables, two-column nav
                           lg  ≥ 1024    full desktop layout
```

## 5. Theming

### 5.1 Theme switch

- Applied via `:root[data-theme="dark"]` on `<html>`.
- Default = light.
- User preference persists in `localStorage` key `mark-matrix:theme`.
- System preference (`prefers-color-scheme`) honored on first visit only.
- Toggle control: small icon-only ghost button in the header (sun / moon, single icon that rotates 180° on swap with a 200ms transition).

### 5.2 Beyond-color theme differences

| Concern | Light | Dark |
|---|---|---|
| Page bg | Paper | Charcoal |
| Surface | pure white | `#232128` |
| Hairlines | warm gray | cool dark gray, just visible on charcoal |
| Drop shadows | none (1px hairline instead) | none, plus an inner border on modals to keep them defined on charcoal |
| Selection highlight | Ink-blue at 25% opacity | Ink-blue at 45% opacity |
| Focus ring | 2px Ink-blue | 2px `#6E9BD1` |
| Disabled control fill | Surface-sunk | Surface-sunk (`#14131A`) |
| Body text color | Ink `#1A1817` | Paper `#E8E2D6` |

### 5.3 Forced-colors mode

For Windows High Contrast (`forced-colors: active`), a parallel set of `:root` overrides swaps border colors to `CanvasText` so hairlines and rules remain visible.

## 6. Component library

Every component is one folder: `ComponentName/ComponentName.tsx` + `ComponentName.module.css` + `ComponentName.test.tsx`. All in `apps/web/src/components/`.

### 6.1 Primitive controls

**`Button`** — variants: `primary` (Ink-blue bg, no radius, weight 600, no shadow), `secondary` (transparent + 1px Ink hairline border), `ghost` (no border, underlined text), `danger` (Error bg for destructive actions). Sizes `sm` (28px), `md` (36px), `lg` (44px). Disabled = 40% opacity, no opacity flash on hover. Hover = swap bg to Ink-blue ×0.92 over 100ms.

**`Field`** — editorial form pattern: label above the control in 13px Small caps letter-spaced; the control itself is a borderless input with a 1px Hairline bottom underline only (no box); error message in 13px Error color directly below. Used everywhere outside table cells.

**`Input`** — borderless, single 1px Hairline bottom. Focus = underline thickens to 2px Ink-blue + 2px Ink-blue outline at 2px offset. Number inputs get `font-mono` + tabular numerals.

**`Select`** — native `<select>` styled to match `Input`. Caret as a small ▾ svg. Native handles keyboard and screen readers.

**`File`** — borderless input with the field label and filename in `Small`. Remove ghost button.

### 6.2 Data

**`Table`** — ruled-hairline editorial style. Header row: paper-sunk background, 13px Small caps letter-spaced, 1px Hairline bottom; body rows: 1px Hairline bottom only, no vertical rules, 44px row height. Text cells left-aligned; numeric cells right-aligned in `Mono`. Hover = Surface-sunk. Empty cell renders as em-dash (`—`) in Hairline color. Sticky header for tall tables.

**`Pagination`** — plain text "Page X of Y" + `«` `‹` `›` `»` buttons styled as ghost. No styled range.

### 6.3 Status

**`Badge`** — uppercase letter-spaced Small caps, 1px border in muted color, transparent bg. Variants: `draft` (Warning border), `submitted` (Ink-blue border), `published` (Success border), `locked` (Ink border + cream fill), `error` (Error border). 2px radius max.

**`Banner`** — full-width strip with 4px left border in variant color + 1px Hairline right/bottom. Variants: `info`, `success`, `warning`, `error`. Title in H3, body in Body.

**`Modal`** — single backdrop variant using `--color-backdrop` (light = Ink at 40%, dark = true black at 70%), max-width 640px, paper background, 1px Hairline border, 4-stop vignette. Header in serif H2, body in Body, footer right-aligned with primary on the right. Escape + click-outside close. Focus trapped.

**`Tabs`** — editorial tabs: 1px Hairline bottom rule, active tab has 2px Ink-blue bottom border + weight 600. No fill, no shadow.

**`Tooltip`** — only on icon-only buttons. Small, paper bg, Hairline border, 13px Small text. Delay 400ms.

### 6.4 Feedback states

**`Empty`** — centered, reserved vertical space, single line of Body-soft in the shape of the missing data. No illustrations.

**`Loading`** — same vertical space as the loaded content; centered mono "Loading…" in Paper-soft. No spinners.

**`ErrorState`** — `Banner` with `error` variant and a "Retry" ghost button on the right.

### 6.5 Shell

**`Header`** — 1px Hairline bottom border only (no dark fill). Wordmark left in Source Serif 4 weight 600. Role pill next to it in `Badge` style. Right side: user name in Body + theme toggle ghost button + "Sign out" as ghost button. 64px tall.

**`Nav`** — horizontal under header, 1px Hairline bottom. Items: Body text, no boxes, active item has 2px Ink-blue bottom border that bleeds 4px past the text width. Hover = Hairline color. Collapses to a vertical drawer below 768px.

**`PageTitle`** — Source Serif 4 H1, optional small caps "eyebrow" above (e.g. "STUDENT · GRADESHEET"), optional subtitle in Body-soft. 32px bottom margin.

### 6.6 Conventions

- One shared `cn()` helper for conditional classnames (no `clsx` dependency), in `apps/web/src/lib/cn.ts`.
- Tokens imported from `apps/web/src/styles/tokens.ts` — no string-typed colors or spacing.
- Every interactive component is keyboard-navigable and ships correct ARIA roles by default.
- `prefers-reduced-motion` zeros all transitions globally.
- If a component is needed but missing from this spec, build it when found following the same conventions.

## 7. Page templates

Page max-width: 1280px, centered, 32px side gutter on desktop. Pages are full-bleed inside that container.

| Template | Composition | Used by |
|---|---|---|
| `LoginTemplate` | Full-page Paper bg, centered 320px field card, serif H1, two `Field`s, primary `Button`, error line. No nav, no header. | `LoginPage` |
| `DashboardTemplate` | `PageTitle` + 3-up "recent" cards filtered by role. Cards: Hairline border, no fill, eyebrow + serif H3 + Body. | `DashboardPlaceholder` and role landing pages |
| `ListTemplate` | `PageTitle` + filter bar (search `Input`, role-specific selects, primary ghost "Add" right-aligned) + `Table` + `Pagination`. Empty / loading / error states replace the table. | Admin Users, Enrollments, Audit Log, Faculty Courses |
| `TreeTemplate` | `PageTitle` + multi-column `FieldPanel` (each column = hairline-bordered surface with heading + selectable items; click loads the next). | `AcademicStructurePage` |
| `DenseEditorTemplate` | `PageTitle` + `Banner` if locked + action bar (Save draft, Submit, CSV upload) + `Table` with in-cell editors + collapsible bulk-error `details` block. | `MarksEntryPage`, `MarkAttendancePage`, roster variants |
| `DetailTemplate` | `PageTitle` + status `Badge` row + meta `dl` + section blocks. Locked indicator if status = locked. Right rail for actions + download. | `MyGradesheetPage` (anchor), `GradesheetAdminPage` |
| `AnalyticsTemplate` | `PageTitle` + 2–4 KPI tiles in a grid + one or two inline-SVG charts + each chart paired with sr-only `<table>` + `Table` of underlying data. | `AnalyticsDashboardPage`, `AnalyticsPage` |

The `<dl>` style for `DetailTemplate`: terms left-aligned in `--type-small` uppercase letter-spaced; definitions in `--type-body`; alternating rows use `--color-surface-sunk`.

## 8. Analytics charts (inline SVG, no library)

Three chart primitives, inline SVG with `currentColor` strokes/fills so they pick up the theme:

- **`BarChart`** — horizontal or vertical, 1px Hairline axis baseline, no grid, tabular numerals on labels.
- **`Sparkline`** — single-series line, no axis, 1px stroke, end-point dot.
- **`DotPlot`** — single-axis dots with optional value labels.

Every chart:
- Uses tabular numerals
- Has a 1px Hairline axis baseline, no grid
- Tooltips on hover (with focus rings for keyboard nav)
- Is followed by an sr-only `<table>` mirroring the data so screen readers get the same info

No chart library, no extra dependency.

## 9. Print stylesheet

`apps/web/src/styles/print.css` with `@media print` rules:

- Strips the header, nav, and any element marked `data-print="hidden"`.
- Expands the gradesheet table to full width with `--type-body` bumped one step.
- Black ink on white paper, regardless of current theme.
- No `data-theme` switching on print.

Applied globally; pages with `DetailTemplate` opt in by adding the appropriate data-attributes.

## 10. Migration strategy

### 10.1 Build order

1. **Foundations** — `apps/web/src/styles/tokens.css`, `tokens.ts`, `globals.css`, `fonts.css`, `print.css`, `theme.ts`, `lib/cn.ts`.
2. **Components** in four phases:
   - A. Primitives: `Button`, `Field`, `Input`, `Select`, `File`
   - B. Data: `Table`, `Pagination`, `Empty`, `Loading`, `ErrorState`
   - C. Status: `Badge`, `Banner`, `Modal`, `Tabs`, `Tooltip`
   - D. Shell: `Header`, `Nav`, `PageTitle`
3. **Shell** — replace `AppShell.tsx` with the new header + nav. Role-driven nav stays driven by `navConfig.ts`.
4. **Anchor page** — rebuild `MyGradesheetPage` against the new components and templates. Locks the `DetailTemplate` contract.
5. **Rollout by role group** (each group is one PR with its own visual review):
   - Student pages: `MyAttendancePage`, `MyMarksPage`, `MyGradesheetPage`
   - Auth: `LoginPage`, `DashboardPlaceholder`, `NotFoundPage`, `ForbiddenPage`
   - Faculty: `FacultyCoursesPage`, `MarksEntryPage`, `RosterMarksPage`, `MarkAttendancePage`, `RosterAttendancePage`, `AnalyticsPage`
   - Admin: `UsersPage`, `AcademicStructurePage`, `AssignmentsPage`, `EnrollmentsPage`, `ResultsReviewPage`, `GradesheetAdminPage`, `AnalyticsDashboardPage`, `AuditLogPage`, `UnlockModal`
6. **Cleanup** — once every page is migrated, delete `styles.css` and any `*.module.css` rule with no consumer. Run `pnpm lint && pnpm typecheck && pnpm test` green.

### 10.2 Rollback safety

- Each role-group PR is independently revertable.
- The old `styles.css` coexists with the new system until step 6; pages switch by importing the new components.
- Theme toggle ships behind the new header; legacy pages stay light-only until migrated.

## 11. Testing

| Layer | Tool | What we check |
|---|---|---|
| Component unit | Vitest + Testing Library | Renders with required ARIA roles; keyboard navigation; theme toggle; `cn()` edge cases |
| Visual regression | Playwright screenshots per page × `{light, dark}` | Pixel-equal to baselines; reviewed on every PR |
| Accessibility | `@axe-core/playwright` on every page | Zero AA violations; blocks CI |
| Contrast | Automated check on every token pair used as fg/bg in `globals.css` | Catches regressions when new tokens are added |
| Type safety | `tsc -b` strict | Tokens imported from `tokens.ts`, no string-typed colors or spacing |
| Lint | ESLint flat config + custom rule | No unused class names, no `style=` attributes, no inline color literals outside `tokens.css` |
| Manual | One full user journey per role before merge | Login → primary task → logout, in both themes |

CI:

- `pnpm typecheck && pnpm test` runs on every PR (already present).
- Visual regression + axe runs on PRs touching `apps/web/src/**`.
- Baseline images in `apps/web/tests/visual/__snapshots__/`, reviewed by maintainer before merge.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Dark theme misses a contrast pair | Contrast check in CI catches it before merge |
| FOIT on serif → flicker on first load | `font-display: swap`, preconnect, Latin-only subset |
| Visual regression baselines cause noisy reviews | Auto-update on infrastructure PRs; human review only when intentional |
| Component prop creep over time | Each component has a `ComponentName.test.tsx` that doubles as living documentation |
| New developer adds a raw hex color | ESLint rule bans `#[0-9a-f]{3,6}` outside `tokens.css` |
| Print stylesheet drifts from screen layout | Print rules in one file, verified manually once per release |
| Theme preference resets on different browser | `localStorage` per-browser is acceptable; users re-toggling takes <1s |
| Component grows complex with too many variants | If a component needs >4 variants, it's a candidate for splitting |

## 13. Decisions log

| Decision | Rationale |
|---|---|
| CSS Modules + typed tokens over Tailwind | Editorial + tactile distinction, no templated feel; matches existing flat-CSS pattern |
| Editorial-institutional direction | Trust signals for academic registry data; distinguishes from generic admin software |
| Light + dark as first-class themes | User base spans day-long grading sessions and evening record checks |
| Desktop-first; mobile fallback for student pages only | Admin and faculty are desktop; students may use mobile but don't need full power on phone |
| WCAG 2.1 AA target | Realistic institutional baseline; achievable with editorial palette |
| No chart library — inline SVG | Avoid visual identity of Recharts/Chart.js defaults; full control over editorial feel |
| Anchor page = student gradesheet | Most official page; tests typography hierarchy, mono numbers, ruled tables, lock state, transcript download |
| Rollout by role group | Each group is independently reviewable and revertable |

## 14. Open questions

None at this time. New components discovered during implementation are added following the conventions in §6.6.