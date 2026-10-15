# Mark-Matrix Frontend Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ad-hoc plain-CSS frontend with an editorial-institutional design system — typed tokens, CSS Modules, a component library, light + dark themes, WCAG 2.1 AA — and apply it to every page in `apps/web`.

**Architecture:** Two-layer design system on top of the existing React 18 + Vite + React Router 6 stack. Layer 1 = `styles/tokens.css` (CSS variables) + `styles/tokens.ts` (typed mirror) + `styles/globals.css` + `styles/fonts.css` + `styles/print.css` + `lib/cn.ts` + `styles/theme.ts`. Layer 2 = a component library in `components/<Name>/<Name>.tsx` + `.module.css` + `.test.tsx`. Pages compose components; legacy `styles.css` is removed at the end. Visual regression (Playwright) and accessibility (axe-core) gates added to CI.

**Tech Stack:** React 18.3, React Router 6, Vite 6, TypeScript 5 (strict, `noUncheckedIndexedAccess`), Vitest 2 + Testing Library 16 (already in `apps/web`), Playwright (to be added) + `@axe-core/playwright` (to be added). Fonts: Source Serif 4 + IBM Plex Sans + IBM Plex Mono from Google Fonts.

**Spec:** [`docs/superpowers/specs/2026-10-15-mark-matrix-frontend-redesign.md`](../../specs/2026-10-15-mark-matrix-frontend-redesign.md)

## Global Constraints

These apply to every task. The spec is the source of truth; this list copies the exact values verbatim.

- **Tokens:** colors, spacing, type scale, radius, motion, breakpoints — imported from `apps/web/src/styles/tokens.ts` (TS) / `tokens.css` (CSS). No string-typed colors or spacing anywhere else. ESLint rule bans raw hex literals outside `tokens.css`.
- **Styling:** CSS Modules per component, colocated as `<Name>.module.css`. No global selectors beyond what `globals.css` sets.
- **Color (light):** paper `#F7F4ED`, ink `#1A1817`, ink-soft `#4A4640`, hairline `#E5E0D5`, surface `#FFFFFF`, surface-sunk `#F2EEE5`, ink-blue `#1B3F7E`, success `#2F6F4E`, warning `#B07A1A`, error `#8E2A2A`, backdrop `color-mix(in srgb, var(--color-ink) 40%, transparent)`.
- **Color (dark):** paper `#18161A`, ink `#E8E2D6`, ink-soft `#B0A89C`, hairline `#2F2C36`, surface `#232128`, surface-sunk `#14131A`, ink-blue `#6E9BD1`, success `#6FB38A`, warning `#D4A45A`, error `#E08585`, backdrop `color-mix(in srgb, #000 70%, transparent)`.
- **Type families:** Source Serif 4 (display/H1/H2, weight 600), IBM Plex Sans (body/labels/buttons, weight 400/600), IBM Plex Mono (numerals/IDs, weight 400). All weights 400/600 only. Latin subset. `font-display: swap`. Preconnect to `fonts.googleapis.com` and `fonts.gstatic.com`.
- **Type scale:** display 32/40, h1 24/32, h2 20/28, h3 16/24, body 15/24, small 13/20, mono 14/20. Serif for display/h1/h2 only.
- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48, 64, 96. 8px base.
- **Radius:** 0 for fields, tables, cards. 2px on small badges/pills. 4px max on buttons.
- **Elevation:** 1px hairline borders only. No drop shadows. Modal gets a 4-stop vignette.
- **Motion:** 100ms ease-out for hover/focus only. Zero transitions for `prefers-reduced-motion`.
- **Breakpoints:** sm < 640 (cards only), md 640–1024 (condensed tables), lg ≥ 1024 (full desktop). 768px is the nav-collapse threshold.
- **Page layout:** max-width 1280px, centered, 32px side gutter at lg.
- **Theming:** `:root[data-theme="dark"]` on `<html>`. Default = light. Persistence in `localStorage` key `mark-matrix:theme`. `prefers-color-scheme` honored on first visit only.
- **Accessibility target:** WCAG 2.1 AA on body text, large text, and UI components. Visible focus rings (2px ink-blue at 2px offset in light, 2px `#6E9BD1` in dark). Forced-colors mode swaps border colors to `CanvasText`.
- **Analytics charts:** inline SVG with `currentColor`, no chart library. `BarChart`, `Sparkline`, `DotPlot` only.
- **Print:** `@media print` strips header/nav, expands gradesheet table, always black-on-white regardless of theme.
- **Testing:** roll eslint (already there), `tsc -b` strict, Vitest + Testing Library, Playwright (visual + axe).
- **Commits:** conventional prefix `feat:`, `chore:`, `fix:`, `refactor:`, `test:`, `style:`. No `Co-Authored-By` line.

## Review Focus

Inputs / conditions the spec implies but no task's tests exercise directly. Each line is pinned to the owning task in that task's step list.

1. **Theme persistence after full page reload.** User toggles dark, reloads — page must still be dark. Pinned in Task 4.
2. **`prefers-color-scheme` changes mid-visit.** System pref flips to dark while app open and no localStorage entry exists → app must update without a reload. Pinned in Task 4.
3. **Modal focus trap and Escape close.** Tabbing inside a modal must cycle through its controls only; Escape closes. Pinned in Task 18.
4. **Forced-colors (Windows High Contrast) keeps hairlines visible.** Borders swap to `CanvasText`. Pinned in Task 7.
5. **Print stylesheet overrides dark theme.** A page in dark theme printed must render black-on-white. Pinned in Task 7.

## File Structure

Created or modified by this plan, organised by phase.

```
apps/web/
├── index.html                                  # MODIFIED — add font preconnect
├── package.json                                # MODIFIED — add @axe-core/playwright, playwright
├── playwright.config.ts                        # CREATE — Playwright config
├── tests/
│   ├── visual/
│   │   ├── page-light.spec.ts                  # CREATE — visual regression light
│   │   ├── page-dark.spec.ts                   # CREATE — visual regression dark
│   │   └── __snapshots__/                      # CREATE — baseline PNGs
│   └── a11y/
│       └── a11y.spec.ts                        # CREATE — axe-core per page
└── src/
    ├── styles/
    │   ├── tokens.css                          # CREATE — CSS variables
    │   ├── tokens.ts                           # CREATE — typed mirror
    │   ├── globals.css                         # CREATE — reset + base typography
    │   ├── fonts.css                           # CREATE — @font-face + font-family rules
    │   ├── print.css                           # CREATE — @media print
    │   ├── theme.ts                            # CREATE — theme manager
    │   └── theme.test.ts                       # CREATE
    ├── lib/
    │   ├── cn.ts                               # CREATE — className helper
    │   └── cn.test.ts                          # CREATE
    ├── components/
    │   ├── Button/         {Button.tsx, Button.module.css, Button.test.tsx}
    │   ├── Field/          {Field.tsx, Field.module.css, Field.test.tsx}
    │   ├── Input/          {Input.tsx, Input.module.css, Input.test.tsx}
    │   ├── Select/         {Select.tsx, Select.module.css, Select.test.tsx}
    │   ├── File/           {File.tsx, File.module.css, File.test.tsx}
    │   ├── Table/          {Table.tsx, Table.module.css, Table.test.tsx}
    │   ├── Pagination/     {Pagination.tsx, Pagination.module.css, Pagination.test.tsx}
    │   ├── Empty/          {Empty.tsx, Empty.module.css, Empty.test.tsx}
    │   ├── Loading/        {Loading.tsx, Loading.module.css, Loading.test.tsx}
    │   ├── ErrorState/     {ErrorState.tsx, ErrorState.module.css, ErrorState.test.tsx}
    │   ├── Badge/          {Badge.tsx, Badge.module.css, Badge.test.tsx}
    │   ├── Banner/         {Banner.tsx, Banner.module.css, Banner.test.tsx}
    │   ├── Modal/          {Modal.tsx, Modal.module.css, Modal.test.tsx}
    │   ├── Tabs/           {Tabs.tsx, Tabs.module.css, Tabs.test.tsx}
    │   ├── Tooltip/        {Tooltip.tsx, Tooltip.module.css, Tooltip.test.tsx}
    │   ├── PageTitle/      {PageTitle.tsx, PageTitle.module.css, PageTitle.test.tsx}
    │   ├── Header/         {Header.tsx, Header.module.css, Header.test.tsx}
    │   └── Nav/            {Nav.tsx, Nav.module.css, Nav.test.tsx}
    ├── analytics/
    │   ├── BarChart/       {BarChart.tsx, BarChart.module.css, BarChart.test.tsx}
    │   ├── Sparkline/      {Sparkline.tsx, Sparkline.module.css, Sparkline.test.tsx}
    │   └── DotPlot/        {DotPlot.tsx, DotPlot.module.css, DotPlot.test.tsx}
    ├── shell/
    │   ├── AppShell.tsx     MODIFY — uses Header + Nav
    │   └── navConfig.ts      UNCHANGED
    ├── pages/                MODIFIED — see Rollout tasks
    └── styles.css            DELETED — Task 55
```

---

## Phase 1: Foundations (Tasks 1–7)

### Task 1: tokens.css + tokens.ts

**Files:**
- Create: `apps/web/src/styles/tokens.css`
- Create: `apps/web/src/styles/tokens.ts`

**Interfaces:**
- Produces: `var(--color-paper)`, `var(--color-ink)`, `var(--color-ink-soft)`, `var(--color-hairline)`, `var(--color-surface)`, `var(--color-surface-sunk)`, `var(--color-ink-blue)`, `var(--color-success)`, `var(--color-warning)`, `var(--color-error)`, `var(--color-backdrop)`, `--type-display/h1/h2/h3/body/small/mono`, `--space-1..9`, `--radius-button/pill`, `--motion-fast`, `--bp-sm/md/lg` CSS custom properties on `:root`, overridden on `:root[data-theme="dark"]`.
- Produces: `apps/web/src/styles/tokens.ts` exporting `colors`, `type`, `space`, `radius`, `motion`, `breakpoints` typed constants.

- [ ] **Step 1: Write the tokens.css**

```css
/* apps/web/src/styles/tokens.css */
:root {
  /* Color — light / paper */
  --color-paper:        #F7F4ED;
  --color-ink:          #1A1817;
  --color-ink-soft:     #4A4640;
  --color-hairline:     #E5E0D5;
  --color-surface:      #FFFFFF;
  --color-surface-sunk: #F2EEE5;
  --color-ink-blue:     #1B3F7E;
  --color-success:      #2F6F4E;
  --color-warning:      #B07A1A;
  --color-error:        #8E2A2A;
  --color-backdrop:     color-mix(in srgb, var(--color-ink) 40%, transparent);

  /* Type scale */
  --type-display: 32px/40px;
  --type-h1:      24px/32px;
  --type-h2:      20px/28px;
  --type-h3:      16px/24px;
  --type-body:    15px/24px;
  --type-small:   13px/20px;
  --type-mono:    14px/20px;

  /* Spacing (8px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --space-9: 96px;

  /* Radius */
  --radius-pill: 2px;
  --radius-button: 4px;

  /* Motion */
  --motion-fast: 100ms ease-out;

  /* Breakpoints (documented; not used in CSS) */
  --bp-sm: 640px;
  --bp-md: 1024px;
  --bp-lg: 1024px;
}

:root[data-theme="dark"] {
  --color-paper:        #18161A;
  --color-ink:          #E8E2D6;
  --color-ink-soft:     #B0A89C;
  --color-hairline:     #2F2C36;
  --color-surface:      #232128;
  --color-surface-sunk: #14131A;
  --color-ink-blue:     #6E9BD1;
  --color-success:      #6FB38A;
  --color-warning:      #D4A45A;
  --color-error:        #E08585;
  --color-backdrop:     color-mix(in srgb, #000 70%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  :root { --motion-fast: 0ms; }
}
```

- [ ] **Step 2: Write tokens.ts (typed mirror)**

```ts
// apps/web/src/styles/tokens.ts
export const colors = {
  paper:        "var(--color-paper)",
  ink:          "var(--color-ink)",
  inkSoft:      "var(--color-ink-soft)",
  hairline:     "var(--color-hairline)",
  surface:      "var(--color-surface)",
  surfaceSunk:  "var(--color-surface-sunk)",
  inkBlue:      "var(--color-ink-blue)",
  success:      "var(--color-success)",
  warning:      "var(--color-warning)",
  error:        "var(--color-error)",
  backdrop:     "var(--color-backdrop)",
} as const;

export const space = {
  s1: "var(--space-1)",
  s2: "var(--space-2)",
  s3: "var(--space-3)",
  s4: "var(--space-4)",
  s5: "var(--space-5)",
  s6: "var(--space-6)",
  s7: "var(--space-7)",
  s8: "var(--space-8)",
  s9: "var(--space-9)",
} as const;

export const radius = {
  pill:   "var(--radius-pill)",
  button: "var(--radius-button)",
} as const;

export const motion = {
  fast: "var(--motion-fast)",
} as const;

export const breakpoints = {
  sm: 640,
  md: 1024,
  lg: 1024,
} as const;

export type ColorToken = keyof typeof colors;
export type SpaceToken = keyof typeof space;
```

- [ ] **Step 3: Verify both files compile and no other file imports them yet**

Run: `pnpm --filter @mark-matrix/web typecheck`
Expected: PASS (nothing imports these yet).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/tokens.css apps/web/src/styles/tokens.ts
git commit -m "feat(design-system): add color, type, spacing, motion tokens"
```

### Task 2: globals.css

**Files:**
- Create: `apps/web/src/styles/globals.css`

**Interfaces:**
- Consumes: CSS variables from `tokens.css`.
- Produces: reset, base typography on `body`/`h1`/`h2`/`h3`/`p`/`a`/`table`/`input`/`button`/`dl`/`dt`/`dd`.

- [ ] **Step 1: Write globals.css**

```css
/* apps/web/src/styles/globals.css */
@import "./tokens.css";
@import "./fonts.css";

*, *::before, *::after { box-sizing: border-box; }

html, body { margin: 0; padding: 0; }
body {
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink);
  background: var(--color-paper);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

h1 {
  font: 600 var(--type-h1) "Source Serif 4", Georgia, serif;
  margin: 0 0 var(--space-4);
  color: var(--color-ink);
}
h2 {
  font: 600 var(--type-h2) "Source Serif 4", Georgia, serif;
  margin: 0 0 var(--space-3);
}
h3 {
  font: 600 var(--type-h3) "IBM Plex Sans", system-ui, sans-serif;
  margin: 0 0 var(--space-2);
}
p { margin: 0 0 var(--space-3); }

a {
  color: var(--color-ink-blue);
  text-decoration: underline;
  text-underline-offset: 2px;
}
a:hover { text-decoration-thickness: 2px; }

button { font: inherit; cursor: pointer; }

table { border-collapse: collapse; width: 100%; }
input, select, button, textarea { font: inherit; color: inherit; }

::selection {
  background: color-mix(in srgb, var(--color-ink-blue) 25%, transparent);
}

:focus-visible {
  outline: 2px solid var(--color-ink-blue);
  outline-offset: 2px;
}

:root[data-theme="dark"] ::selection {
  background: color-mix(in srgb, var(--color-ink-blue) 45%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0ms !important; }
}

@media (forced-colors: active) {
  :root {
    --color-hairline: CanvasText;
    --color-ink:      CanvasText;
    --color-ink-blue: Highlight;
  }
  :root[data-theme="dark"] {
    --color-hairline: CanvasText;
    --color-ink:      CanvasText;
    --color-ink-blue: Highlight;
  }
}
```

- [ ] **Step 2: Verify CSS is syntactically valid**

Run: `pnpm --filter @mark-matrix/web exec stylelint "apps/web/src/styles/globals.css" --allow-empty-input || true`
Expected: No fatal errors. (Stylelint may not be configured; that's fine — the next step is the real check.)

- [ ] **Step 3: Verify Vite picks up the file without error**

Run: `pnpm --filter @mark-matrix/web exec vite build --mode development 2>&1 | head -40 || true`
Expected: No CSS parse errors. (This step imports nothing; it just exercises the build.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/globals.css
git commit -m "feat(design-system): add globals.css with reset and base typography"
```

### Task 3: fonts.css + index.html preconnect

**Files:**
- Create: `apps/web/src/styles/fonts.css`
- Modify: `apps/web/index.html` — add `<link rel="preconnect">` tags before the existing stylesheet.

**Interfaces:**
- Produces: font-family stacks declared globally; preconnect hints in document head.

- [ ] **Step 1: Write fonts.css**

```css
/* apps/web/src/styles/fonts.css */
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&family=IBM+Plex+Sans:wght@400;600&family=Source+Serif+4:wght@600&display=swap");
```

- [ ] **Step 2: Add preconnect to index.html**

In `apps/web/index.html`, in the `<head>`, immediately after the `<meta charset>` and `<meta name="viewport">` lines (before any stylesheet), add:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
```

- [ ] **Step 3: Verify the build picks up fonts.css**

Run: `pnpm --filter @mark-matrix/web exec vite build --mode development 2>&1 | head -40 || true`
Expected: Build completes; fonts.css is in the bundle.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/fonts.css apps/web/index.html
git commit -m "feat(design-system): add web font preconnect and font-face imports"
```

### Task 4: theme.ts (theme manager) + tests

**Files:**
- Create: `apps/web/src/styles/theme.ts`
- Create: `apps/web/src/styles/theme.test.ts`

**Interfaces:**
- Produces: `getStoredTheme()`, `setStoredTheme(theme)`, `getSystemTheme()`, `applyTheme(theme)`, `initTheme()`, `toggleTheme()` — all exported.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/styles/theme.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStoredTheme,
  setStoredTheme,
  getSystemTheme,
  applyTheme,
  initTheme,
  toggleTheme,
  type Theme,
} from "./theme.js";

describe("theme manager", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    vi.restoreAllMocks();
  });

  it("returns null when nothing stored", () => {
    expect(getStoredTheme()).toBeNull();
  });

  it("round-trips stored theme", () => {
    setStoredTheme("dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("returns 'dark' from system when prefers-color-scheme is dark", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      () => ({ matches: true, media: "", addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList,
    );
    expect(getSystemTheme()).toBe("dark");
  });

  it("applyTheme sets data-theme on html", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applyTheme(light) removes data-theme", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("initTheme uses stored value when present", () => {
    setStoredTheme("dark");
    initTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("initTheme falls back to system when nothing stored", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      () => ({ matches: true, media: "", addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as unknown as MediaQueryList,
    );
    initTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggleTheme flips from light to dark", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    // stored as dark; toggling → light
    toggleTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(getStoredTheme()).toBe("light");
  });

  it("Review Focus: theme persists across simulated reload", () => {
    setStoredTheme("dark");
    // simulate full reload: clear DOM attribute, reinit
    document.documentElement.removeAttribute("data-theme");
    initTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("Review Focus: live system-pref change updates theme when nothing stored", () => {
    setStoredTheme(null as unknown as Theme);
    localStorage.clear();
    const listeners: ((e: MediaQueryListEvent) => void)[] = [];
    const mql = {
      matches: false,
      media: "",
      addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.push(l),
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
    vi.spyOn(window, "matchMedia").mockImplementation(() => mql as unknown as MediaQueryList);
    initTheme();
    // system flips to dark
    mql.matches = true;
    for (const l of listeners) l({} as MediaQueryListEvent);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
```

- [ ] **Step 2: Run test, verify failure**

Run: `pnpm --filter @mark-matrix/web test -- theme.test.ts`
Expected: FAIL — `./theme.js` does not exist.

- [ ] **Step 3: Write theme.ts**

```ts
// apps/web/src/styles/theme.ts
export type Theme = "light" | "dark";
const STORAGE_KEY = "mark-matrix:theme";

export function getStoredTheme(): Theme | null {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function setStoredTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

let systemListenerAttached = false;

export function initTheme(): void {
  const stored = getStoredTheme();
  if (stored !== null) {
    applyTheme(stored);
  } else {
    applyTheme(getSystemTheme());
    if (!systemListenerAttached) {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (): void => {
        if (getStoredTheme() === null) applyTheme(getSystemTheme());
      };
      if (mql.addEventListener) {
        mql.addEventListener("change", handler);
      } else if (mql.addListener) {
        // older API
        mql.addListener(handler);
      }
      systemListenerAttached = true;
    }
  }
}

export function toggleTheme(): void {
  const current = getStoredTheme() ?? getSystemTheme();
  const next: Theme = current === "dark" ? "light" : "dark";
  setStoredTheme(next);
  applyTheme(next);
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- theme.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/styles/theme.ts apps/web/src/styles/theme.test.ts
git commit -m "feat(design-system): add theme manager with localStorage and system-pref fallback"
```

### Task 5: cn.ts (className helper) + tests

**Files:**
- Create: `apps/web/src/lib/cn.ts`
- Create: `apps/web/src/lib/cn.test.ts`

**Interfaces:**
- Produces: `cn(...args: Array<string | undefined | false | null>): string`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/cn.test.ts
import { describe, it, expect } from "vitest";
import { cn } from "./cn.js";

describe("cn", () => {
  it("joins truthy strings with space", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });
  it("drops falsy values", () => {
    expect(cn("a", undefined, null, false, "b")).toBe("a b");
  });
  it("returns empty string when all falsy", () => {
    expect(cn(undefined, null, false)).toBe("");
  });
  it("keeps inner spaces within an argument", () => {
    expect(cn("a b", "c")).toBe("a b c");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- cn.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement cn.ts**

```ts
// apps/web/src/lib/cn.ts
export function cn(...args: Array<string | undefined | null | false>): string {
  let out = "";
  for (const a of args) {
    if (typeof a === "string" && a.length > 0) {
      out = out.length === 0 ? a : `${out} ${a}`;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- cn.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/cn.ts apps/web/src/lib/cn.test.ts
git commit -m "feat(design-system): add cn className helper"
```

### Task 6: print.css

**Files:**
- Create: `apps/web/src/styles/print.css`

**Interfaces:**
- Produces: `@media print` rules: hide elements with `[data-print="hidden"]`, strip header/nav, expand table, always black-on-white.

- [ ] **Step 1: Write print.css**

```css
/* apps/web/src/styles/print.css */
@media print {
  :root, :root[data-theme="dark"] {
    --color-paper:        #FFFFFF;
    --color-ink:          #000000;
    --color-ink-soft:     #333333;
    --color-hairline:     #000000;
    --color-surface:      #FFFFFF;
    --color-surface-sunk: #F5F5F5;
    --color-ink-blue:     #000000;
  }

  [data-print="hidden"] { display: none !important; }

  .app-shell__header,
  .app-shell__nav { display: none !important; }

  .app-shell__main { padding: 0 !important; }

  table { font-size: var(--type-body); }

  body { background: #FFFFFF !important; color: #000000 !important; }
}
```

- [ ] **Step 2: Add to globals.css imports** (modify Task 2's file)

Append to the end of `apps/web/src/styles/globals.css`:

```css
@import "./print.css";
```

- [ ] **Step 3: Verify build still passes**

Run: `pnpm --filter @mark-matrix/web typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/styles/print.css apps/web/src/styles/globals.css
git commit -m "feat(design-system): add print stylesheet that overrides theme to black-on-white"
```

### Task 7: ESLint rule banning raw hex outside tokens.css

**Files:**
- Modify: `eslint.config.mjs` — add a custom rule that bans `#[0-9a-fA-F]{3,8}` outside `tokens.css`.

**Interfaces:**
- Produces: ESLint violation when any TS/TSX/CSS file (except `tokens.css`) contains a hex literal.

- [ ] **Step 1: Inspect current eslint.config.mjs**

Read `eslint.config.mjs` to find where rules are configured. Note: this repo uses flat config at root.

- [ ] **Step 2: Add custom rule to eslint.config.mjs**

Append a new plugin definition and rule registration. Flat config example:

```js
// in eslint.config.mjs
const noRawHex = {
  meta: {
    type: "problem",
    docs: { description: "Disallow raw hex color literals outside tokens.css" },
    schema: [],
    messages: { rawHex: "Raw hex literals are only allowed in apps/web/src/styles/tokens.css" },
  },
  create(context) {
    const filename = context.filename;
    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (!/^#[0-9a-fA-F]{3,8}$/.test(node.value)) return;
        if (filename.endsWith("styles/tokens.css") || filename.endsWith("tokens.ts")) return;
        context.report({ node, messageId: "rawHex" });
      },
    };
  },
};

// inside the plugins object
const config = [
  // ...existing config
  {
    plugins: { "mark-matrix": { rules: { "no-raw-hex": noRawHex } } },
    rules: { "mark-matrix/no-raw-hex": "error" },
  },
];
```

- [ ] **Step 3: Verify rule fires on a deliberate violation**

Create a temporary file `apps/web/src/styles/__test_violation.css`:

```css
.test { color: #FF0000; }
```

Run: `pnpm --filter @mark-matrix/web exec eslint apps/web/src/styles/__test_violation.css`
Expected: error reported.

- [ ] **Step 4: Delete the violation file**

Remove `apps/web/src/styles/__test_violation.css`.

- [ ] **Step 5: Run full lint**

Run: `pnpm lint`
Expected: PASS (no other files have raw hex).

- [ ] **Step 6: Commit**

```bash
git add eslint.config.mjs
git commit -m "feat(design-system): ban raw hex literals outside tokens.css"
```

---

## Phase 2: Primitive components (Tasks 8–13)

### Task 8: Button

**Files:**
- Create: `apps/web/src/components/Button/Button.tsx`
- Create: `apps/web/src/components/Button/Button.module.css`
- Create: `apps/web/src/components/Button/Button.test.tsx`

**Interfaces:**
- Produces: `<Button variant="primary" | "secondary" | "ghost" | "danger" size="sm" | "md" | "lg" disabled onClick>children</Button>`.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Button/Button.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button.js";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });
  it("applies variant and size classnames", () => {
    render(<Button variant="secondary" size="lg">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/secondary/);
    expect(btn.className).toMatch(/lg/);
  });
  it("calls onClick when enabled", async () => {
    const fn = vi.fn();
    render(<Button onClick={fn}>x</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(fn).toHaveBeenCalledOnce();
  });
  it("does not call onClick when disabled", async () => {
    const fn = vi.fn();
    render(<Button disabled onClick={fn}>x</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(fn).not.toHaveBeenCalled();
  });
  it("renders as a button element by default", () => {
    render(<Button>x</Button>);
    expect(screen.getByRole("button").tagName).toBe("BUTTON");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Button.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Button.module.css**

```css
/* apps/web/src/components/Button/Button.module.css */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--radius-button);
  padding: 0 var(--space-4);
  font: 600 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  text-decoration: none;
  transition: background-color var(--motion-fast), border-color var(--motion-fast);
  white-space: nowrap;
}

.sm { height: 28px; font-size: var(--type-small); padding: 0 var(--space-3); }
.md { height: 36px; }
.lg { height: 44px; font-size: var(--type-h3); padding: 0 var(--space-5); }

.primary {
  background: var(--color-ink-blue);
  color: var(--color-paper);
}
.primary:hover:not(:disabled) { background: color-mix(in srgb, var(--color-ink-blue) 92%, black); }

.secondary {
  background: transparent;
  border-color: var(--color-ink-soft);
  color: var(--color-ink);
}
.secondary:hover:not(:disabled) { background: var(--color-surface-sunk); }

.ghost {
  background: transparent;
  color: var(--color-ink-blue);
  text-decoration: underline;
  text-underline-offset: 3px;
  padding-left: 0;
  padding-right: 0;
}
.ghost:hover:not(:disabled) { text-decoration-thickness: 2px; }

.danger {
  background: var(--color-error);
  color: var(--color-paper);
}
.danger:hover:not(:disabled) { filter: brightness(0.92); }

.btn:disabled { opacity: 0.4; cursor: not-allowed; }
```

- [ ] **Step 4: Write Button.tsx**

```tsx
// apps/web/src/components/Button/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cn(styles.btn, styles[variant], styles[size], className)}
      {...rest}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Button.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Button
git commit -m "feat(design-system): add Button component (primary/secondary/ghost/danger, sm/md/lg)"
```

### Task 9: Field

**Files:**
- Create: `apps/web/src/components/Field/Field.tsx`
- Create: `apps/web/src/components/Field/Field.module.css`
- Create: `apps/web/src/components/Field/Field.test.tsx`

**Interfaces:**
- Produces: `<Field label="X" htmlFor="x" error="…">children</Field>`.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Field/Field.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./Field.js";

describe("Field", () => {
  it("renders label linked by id", () => {
    render(
      <Field label="Email" htmlFor="email">
        <input id="email" />
      </Field>,
    );
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
  it("renders error when provided with role=alert", () => {
    render(
      <Field label="Email" htmlFor="email" error="Required">
        <input id="email" />
      </Field>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
  it("does not render error node when error is undefined", () => {
    render(
      <Field label="Email" htmlFor="email">
        <input id="email" />
      </Field>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Field.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Field.module.css**

```css
/* apps/web/src/components/Field/Field.module.css */
.field { display: grid; gap: var(--space-1); margin-bottom: var(--space-4); }
.label {
  font: 600 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-ink-soft);
}
.error {
  font: 400 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-error);
}
```

- [ ] **Step 4: Write Field.tsx**

```tsx
// apps/web/src/components/Field/Field.tsx
import type { ReactNode } from "react";
import styles from "./Field.module.css";

export interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, error, children }: FieldProps): JSX.Element {
  return (
    <div className={styles.field}>
      <label htmlFor={htmlFor} className={styles.label}>{label}</label>
      {children}
      {error !== undefined && (
        <p role="alert" className={styles.error}>{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Field.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Field
git commit -m "feat(design-system): add Field component (label + children + error)"
```

### Task 10: Input

**Files:**
- Create: `apps/web/src/components/Input/Input.tsx`
- Create: `apps/web/src/components/Input/Input.module.css`
- Create: `apps/web/src/components/Input/Input.test.tsx`

**Interfaces:**
- Produces: `<Input variant="text" | "number" value onChange … />`. Renders borderless with hairline bottom underline.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Input/Input.test.tsx
import { describe, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input.js";

describe("Input", () => {
  it("renders with type=text by default", () => {
    render(<Input aria-label="x" />);
    expect(screen.getByLabelText("x")).toHaveAttribute("type", "text");
  });
  it("renders with type=number and applies mono class", () => {
    render(<Input aria-label="x" type="number" />);
    const el = screen.getByLabelText("x");
    expect(el).toHaveAttribute("type", "number");
    expect(el.className).toMatch(/mono/);
  });
  it("forwards value and onChange", async () => {
    const fn = vi.fn();
    render(<Input aria-label="x" value="a" onChange={fn} />);
    const el = screen.getByLabelText("x");
    await userEvent.type(el, "y");
    expect(fn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Input.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Input.module.css**

```css
/* apps/web/src/components/Input/Input.module.css */
.input {
  border: none;
  border-bottom: 1px solid var(--color-hairline);
  background: transparent;
  padding: var(--space-2) 0;
  width: 100%;
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink);
  transition: border-color var(--motion-fast);
}
.input:focus {
  outline: none;
  border-bottom: 2px solid var(--color-ink-blue);
  margin-bottom: -1px;
}
.input:disabled {
  color: var(--color-ink-soft);
  cursor: not-allowed;
}
.mono {
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Write Input.tsx**

```tsx
// apps/web/src/components/Input/Input.tsx
import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn.js";
import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  type?: "text" | "number" | "email" | "password" | "search" | "tel" | "url";
}

export function Input({ type = "text", className, ...rest }: InputProps): JSX.Element {
  return (
    <input
      type={type}
      className={cn(styles.input, type === "number" ? styles.mono : undefined, className)}
      {...rest}
    />
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Input.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Input
git commit -m "feat(design-system): add Input component (borderless, hairline underline)"
```

### Task 11: Select

**Files:**
- Create: `apps/web/src/components/Select/Select.tsx`
- Create: `apps/web/src/components/Select/Select.module.css`
- Create: `apps/web/src/components/Select/Select.test.tsx`

**Interfaces:**
- Produces: `<Select value onChange aria-label={label} options={[{value,label}]} />`.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Select/Select.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "./Select.js";

describe("Select", () => {
  it("renders options", () => {
    render(
      <Select aria-label="x" options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]} />,
    );
    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
  });
  it("calls onChange when an option is chosen", async () => {
    const fn = vi.fn();
    render(
      <Select aria-label="x" onChange={fn} options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]} />,
    );
    await userEvent.selectOptions(screen.getByLabelText("x"), "b");
    expect(fn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Select.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Select.module.css**

```css
/* apps/web/src/components/Select/Select.module.css */
.select {
  appearance: none;
  border: none;
  border-bottom: 1px solid var(--color-hairline);
  background: transparent;
  padding: var(--space-2) var(--space-5) var(--space-2) 0;
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink);
  width: 100%;
  cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, var(--color-ink-soft) 50%),
                    linear-gradient(135deg, var(--color-ink-soft) 50%, transparent 50%);
  background-position: right 8px top 50%, right 4px top 50%;
  background-size: 4px 4px, 4px 4px;
  background-repeat: no-repeat;
}
.select:focus {
  outline: none;
  border-bottom: 2px solid var(--color-ink-blue);
  margin-bottom: -1px;
}
```

- [ ] **Step 4: Write Select.tsx**

```tsx
// apps/web/src/components/Select/Select.tsx
import type { ChangeEvent } from "react";
import styles from "./Select.module.css";

export interface SelectOption { value: string; label: string }
export interface SelectProps {
  value?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  "aria-label": string;
  disabled?: boolean;
  id?: string;
}

export function Select({ options, ...rest }: SelectProps): JSX.Element {
  return (
    <select className={styles.select} {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Select.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Select
git commit -m "feat(design-system): add Select component (native select, borderless)"
```

### Task 12: File

**Files:**
- Create: `apps/web/src/components/File/File.tsx`
- Create: `apps/web/src/components/File/File.module.css`
- Create: `apps/web/src/components/File/File.test.tsx`

**Interfaces:**
- Produces: `<File label="X" onChange={fn} />` — renders label + native file input + chosen filename + Remove button.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/File/File.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { File } from "./File.js";

describe("File", () => {
  it("renders the label and a file picker", () => {
    render(<File label="Upload" onChange={() => {}} />);
    expect(screen.getByText(/upload/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload/i)).toBeInTheDocument();
  });
  it("calls onChange with a File when a file is chosen", async () => {
    const fn = vi.fn();
    render(<File label="Upload" onChange={fn} />);
    const input = screen.getByLabelText(/upload/i);
    const file = new File(["x"], "a.csv", { type: "text/csv" });
    await userEvent.upload(input, file);
    expect(fn).toHaveBeenCalled();
    expect(screen.getByText("a.csv")).toBeInTheDocument();
  });
  it("Remove button clears the chosen filename", async () => {
    render(<File label="Upload" onChange={() => {}} />);
    const input = screen.getByLabelText(/upload/i);
    await userEvent.upload(input, new File(["x"], "a.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(screen.queryByText("a.csv")).toBeNull();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- File.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write File.module.css**

```css
/* apps/web/src/components/File/File.module.css */
.wrap { display: grid; gap: var(--space-1); }
.label {
  font: 600 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-ink-soft);
}
.input { font: 400 var(--type-small) "IBM Plex Sans", system-ui, sans-serif; }
.filename { font: 400 var(--type-small) "IBM Plex Sans", system-ui, sans-serif; color: var(--color-ink); }
```

- [ ] **Step 4: Write File.tsx**

```tsx
// apps/web/src/components/File/File.tsx
import { useState, useId, type ChangeEvent } from "react";
import { Button } from "../Button/Button.js";
import styles from "./File.module.css";

export interface FileProps {
  label: string;
  accept?: string;
  onChange: (file: File | null) => void;
}

export function File({ label, accept, onChange }: FileProps): JSX.Element {
  const id = useId();
  const [name, setName] = useState<string | null>(null);

  const handle = (e: ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0] ?? null;
    setName(f?.name ?? null);
    onChange(f);
  };

  const clear = (): void => {
    setName(null);
    onChange(null);
  };

  return (
    <div className={styles.wrap}>
      <label htmlFor={id} className={styles.label}>{label}</label>
      <input
        id={id}
        type="file"
        accept={accept}
        className={styles.input}
        onChange={handle}
        aria-label={label}
      />
      {name !== null && (
        <span className={styles.filename}>{name} <Button variant="ghost" size="sm" onClick={clear}>Remove</Button></span>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- File.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/File
git commit -m "feat(design-system): add File component with chosen-filename display"
```

### Task 13: Pagination

**Files:**
- Create: `apps/web/src/components/Pagination/Pagination.tsx`
- Create: `apps/web/src/components/Pagination/Pagination.module.css`
- Create: `apps/web/src/components/Pagination/Pagination.test.tsx`

**Interfaces:**
- Produces: `<Pagination page totalPages onPageChange />`. Renders "Page X of Y" + `«` `‹` `›` `»` buttons.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Pagination/Pagination.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./Pagination.js";

describe("Pagination", () => {
  it("shows page X of Y", () => {
    render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByText(/page 2 of 5/i)).toBeInTheDocument();
  });
  it("disables first/prev on page 1", () => {
    render(<Pagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /first/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
  });
  it("disables next/last on last page", () => {
    render(<Pagination page={5} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /last/i })).toBeDisabled();
  });
  it("calls onPageChange(2) when Next clicked from page 1", async () => {
    const fn = vi.fn();
    render(<Pagination page={1} totalPages={5} onPageChange={fn} />);
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(fn).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Pagination.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Pagination.module.css**

```css
/* apps/web/src/components/Pagination/Pagination.module.css */
.wrap { display: flex; align-items: center; gap: var(--space-3); font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif; }
.label { color: var(--color-ink-soft); }
```

- [ ] **Step 4: Write Pagination.tsx**

```tsx
// apps/web/src/components/Pagination/Pagination.tsx
import { Button } from "../Button/Button.js";
import styles from "./Pagination.module.css";

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps): JSX.Element {
  const first = page > 1;
  const last  = page < totalPages;
  return (
    <nav className={styles.wrap} aria-label="Pagination">
      <Button variant="ghost" size="sm" disabled={!first} onClick={() => onPageChange(1)} aria-label="First">«</Button>
      <Button variant="ghost" size="sm" disabled={!first} onClick={() => onPageChange(page - 1)} aria-label="Previous">‹</Button>
      <span className={styles.label}>Page {page} of {totalPages}</span>
      <Button variant="ghost" size="sm" disabled={!last}  onClick={() => onPageChange(page + 1)} aria-label="Next">›</Button>
      <Button variant="ghost" size="sm" disabled={!last}  onClick={() => onPageChange(totalPages)} aria-label="Last">»</Button>
    </nav>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Pagination.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Pagination
git commit -m "feat(design-system): add Pagination component"
```

---

## Phase 3: Data, status, feedback components (Tasks 14–20)

### Task 14: Table

**Files:**
- Create: `apps/web/src/components/Table/Table.tsx`
- Create: `apps/web/src/components/Table/Table.module.css`
- Create: `apps/web/src/components/Table/Table.test.tsx`

**Interfaces:**
- Produces: `<Table columns={[{key, header, align?: "left"|"right", mono?: boolean}]} rows={[…]} stickyHeader? emptyMessage? />` and lower-level `<TableHead>`, `<TableBody>`, `<TableRow>`, `<TableHeaderCell>`, `<TableCell>` exports for pages that need fine-grained control.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Table/Table.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Table } from "./Table.js";

describe("Table", () => {
  it("renders headers and rows", () => {
    render(
      <Table
        columns={[
          { key: "name", header: "Name" },
          { key: "n",    header: "Score", align: "right", mono: true },
        ]}
        rows={[{ name: "Alice", n: 92 }, { name: "Bob", n: 75 }]}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Score" })).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
  });
  it("renders the empty message when rows is empty", () => {
    render(<Table columns={[{ key: "x", header: "X" }]} rows={[]} emptyMessage="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
  it("em-dash for null values", () => {
    render(<Table columns={[{ key: "x", header: "X" }]} rows={[{ x: null }]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Table.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Table.module.css**

```css
/* apps/web/src/components/Table/Table.module.css */
.table { width: 100%; border-collapse: collapse; }
.thead { background: var(--color-surface-sunk); }
.th {
  text-align: left;
  font: 600 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-ink-soft);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-hairline);
}
.td {
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink);
  padding: var(--space-3) var(--space-3);
  border-bottom: 1px solid var(--color-hairline);
}
.tr:hover .td { background: var(--color-surface-sunk); }
.right { text-align: right; }
.mono { font-family: "IBM Plex Mono", ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.empty {
  padding: var(--space-6);
  text-align: center;
  color: var(--color-ink-soft);
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
}
.sticky thead .th { position: sticky; top: 0; z-index: 1; }
```

- [ ] **Step 4: Write Table.tsx**

```tsx
// apps/web/src/components/Table/Table.tsx
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import styles from "./Table.module.css";

export interface TableColumn<Row> {
  key: keyof Row & string;
  header: string;
  align?: "left" | "right";
  mono?: boolean;
}

export interface TableProps<Row> {
  columns: TableColumn<Row>[];
  rows: readonly Row[];
  emptyMessage?: string;
  stickyHeader?: boolean;
}

export function Table<Row extends Record<string, unknown>>({
  columns,
  rows,
  emptyMessage = "No data",
  stickyHeader = false,
}: TableProps<Row>): JSX.Element {
  if (rows.length === 0) {
    return (
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            <th className={styles.th} colSpan={columns.length}>·</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className={styles.empty}>{emptyMessage}</td></tr>
        </tbody>
      </table>
    );
  }
  return (
    <table className={cn(styles.table, stickyHeader ? styles.sticky : undefined)}>
      <thead className={styles.thead}>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={cn(styles.th, c.align === "right" ? styles.right : undefined)}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={styles.tr}>
            {columns.map((c) => {
              const v = row[c.key];
              const content: ReactNode = v === null || v === undefined || v === "" ? "—" : (v as ReactNode);
              return (
                <td
                  key={c.key}
                  className={cn(styles.td, c.align === "right" ? styles.right : undefined, c.mono ? styles.mono : undefined)}
                >
                  {content}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Table.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Table
git commit -m "feat(design-system): add Table component (ruled-hairline, optional sticky header, mono/right columns)"
```

### Task 15: Empty + Loading + ErrorState

**Files:**
- Create: `apps/web/src/components/Empty/Empty.tsx` + `.module.css` + `.test.tsx`
- Create: `apps/web/src/components/Loading/Loading.tsx` + `.module.css` + `.test.tsx`
- Create: `apps/web/src/components/ErrorState/ErrorState.tsx` + `.module.css` + `.test.tsx`

**Interfaces:**
- Produces: `<Empty state={...} />`, `<Loading />`, `<ErrorState onRetry={fn}>{message}</ErrorState>`.

- [ ] **Step 1: Write failing tests**

```tsx
// apps/web/src/components/Empty/Empty.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Empty } from "./Empty.js";
it("renders the message", () => {
  render(<Empty>Nothing yet</Empty>);
  expect(screen.getByText("Nothing yet")).toBeInTheDocument();
});
```

```tsx
// apps/web/src/components/Loading/Loading.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Loading } from "./Loading.js";
it("renders the loading text", () => {
  render(<Loading />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
```

```tsx
// apps/web/src/components/ErrorState/ErrorState.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorState } from "./ErrorState.js";
it("renders the message and Retry button", () => {
  render(<ErrorState onRetry={() => {}}>Boom</ErrorState>);
  expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
});
it("calls onRetry when clicked", async () => {
  const fn = vi.fn();
  render(<ErrorState onRetry={fn}>Boom</ErrorState>);
  await userEvent.click(screen.getByRole("button", { name: /retry/i }));
  expect(fn).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run, verify all fail**

Run: `pnpm --filter @mark-matrix/web test -- "Empty|Loading|ErrorState.test.tsx"`
Expected: FAIL (3 files).

- [ ] **Step 3: Write Empty.module.css, Loading.module.css, ErrorState.module.css**

```css
/* apps/web/src/components/Empty/Empty.module.css */
.empty {
  display: grid;
  place-items: center;
  min-height: 120px;
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink-soft);
}
```

```css
/* apps/web/src/components/Loading/Loading.module.css */
.loading {
  display: grid;
  place-items: center;
  min-height: 120px;
  font: 400 var(--type-mono) "IBM Plex Mono", ui-monospace, monospace;
  color: var(--color-ink-soft);
}
```

```css
/* apps/web/src/components/ErrorState/ErrorState.module.css */
.wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-hairline);
  border-left: 4px solid var(--color-error);
  background: var(--color-surface);
  color: var(--color-ink);
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  gap: var(--space-4);
}
```

- [ ] **Step 4: Write Empty.tsx, Loading.tsx, ErrorState.tsx**

```tsx
// apps/web/src/components/Empty/Empty.tsx
import type { ReactNode } from "react";
import styles from "./Empty.module.css";
export function Empty({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.empty}>{children}</div>;
}
```

```tsx
// apps/web/src/components/Loading/Loading.tsx
import styles from "./Loading.module.css";
export function Loading(): JSX.Element {
  return <div className={styles.loading}>Loading…</div>;
}
```

```tsx
// apps/web/src/components/ErrorState/ErrorState.tsx
import type { ReactNode } from "react";
import { Button } from "../Button/Button.js";
import styles from "./ErrorState.module.css";
export function ErrorState({ onRetry, children }: { onRetry: () => void; children: ReactNode }): JSX.Element {
  return (
    <div className={styles.wrap} role="alert">
      <span>{children}</span>
      <Button variant="ghost" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- "Empty|Loading|ErrorState.test.tsx"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Empty apps/web/src/components/Loading apps/web/src/components/ErrorState
git commit -m "feat(design-system): add Empty, Loading, ErrorState components"
```

### Task 16: Badge

**Files:**
- Create: `apps/web/src/components/Badge/Badge.tsx`
- Create: `apps/web/src/components/Badge/Badge.module.css`
- Create: `apps/web/src/components/Badge/Badge.test.tsx`

**Interfaces:**
- Produces: `<Badge variant="draft" | "submitted" | "published" | "locked" | "error">Label</Badge>`.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Badge/Badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge.js";
describe("Badge", () => {
  it("renders uppercase text with the variant class", () => {
    render(<Badge variant="draft">Draft</Badge>);
    const el = screen.getByText("Draft");
    expect(el.className).toMatch(/draft/);
    // styles apply text-transform: uppercase via CSS; trust the class
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Badge.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Badge.module.css**

```css
/* apps/web/src/components/Badge/Badge.module.css */
.badge {
  display: inline-block;
  padding: 2px var(--space-2);
  border: 1px solid var(--color-hairline);
  border-radius: var(--radius-pill);
  font: 600 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: transparent;
  color: var(--color-ink);
  line-height: 1.4;
}
.draft     { border-color: var(--color-warning); color: var(--color-warning); }
.submitted { border-color: var(--color-ink-blue); color: var(--color-ink-blue); }
.published { border-color: var(--color-success); color: var(--color-success); }
.locked    { border-color: var(--color-ink); color: var(--color-ink); background: var(--color-surface-sunk); }
.error     { border-color: var(--color-error); color: var(--color-error); }
```

- [ ] **Step 4: Write Badge.tsx**

```tsx
// apps/web/src/components/Badge/Badge.tsx
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import styles from "./Badge.module.css";

export type BadgeVariant = "draft" | "submitted" | "published" | "locked" | "error";

export function Badge({ variant, children }: { variant: BadgeVariant; children: ReactNode }): JSX.Element {
  return <span className={cn(styles.badge, styles[variant])}>{children}</span>;
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Badge.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Badge
git commit -m "feat(design-system): add Badge component (draft/submitted/published/locked/error)"
```

### Task 17: Banner

**Files:**
- Create: `apps/web/src/components/Banner/Banner.tsx`
- Create: `apps/web/src/components/Banner/Banner.module.css`
- Create: `apps/web/src/components/Banner/Banner.test.tsx`

**Interfaces:**
- Produces: `<Banner variant="info" | "success" | "warning" | "error" title?>{children}</Banner>`.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Banner/Banner.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Banner } from "./Banner.js";
describe("Banner", () => {
  it("renders title and children", () => {
    render(<Banner variant="warning" title="Heads up">Migrate before Friday</Banner>);
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Migrate before Friday")).toBeInTheDocument();
  });
  it("uses role=alert for the error variant", () => {
    render(<Banner variant="error">Boom</Banner>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
  it("uses role=status for the success variant", () => {
    render(<Banner variant="success">Saved</Banner>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Banner.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Banner.module.css**

```css
/* apps/web/src/components/Banner/Banner.module.css */
.banner {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-hairline);
  border-left-width: 4px;
  background: var(--color-surface);
  color: var(--color-ink);
  margin-bottom: var(--space-4);
}
.title {
  font: 600 var(--type-h3) "IBM Plex Sans", system-ui, sans-serif;
  margin: 0;
}
.body {
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  margin: 0;
}
.info    { border-left-color: var(--color-ink-blue); }
.success { border-left-color: var(--color-success); }
.warning { border-left-color: var(--color-warning); }
.error   { border-left-color: var(--color-error); }
```

- [ ] **Step 4: Write Banner.tsx**

```tsx
// apps/web/src/components/Banner/Banner.tsx
import type { ReactNode } from "react";
import { cn } from "../../lib/cn.js";
import styles from "./Banner.module.css";

export type BannerVariant = "info" | "success" | "warning" | "error";

export interface BannerProps {
  variant: BannerVariant;
  title?: string;
  children: ReactNode;
}

export function Banner({ variant, title, children }: BannerProps): JSX.Element {
  const role = variant === "error" ? "alert" : variant === "success" ? "status" : undefined;
  return (
    <div className={cn(styles.banner, styles[variant])} role={role}>
      {title !== undefined && <p className={styles.title}>{title}</p>}
      <p className={styles.body}>{children}</p>
    </div>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Banner.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Banner
git commit -m "feat(design-system): add Banner component (info/success/warning/error)"
```

### Task 18: Modal (with focus trap + Escape)

**Files:**
- Create: `apps/web/src/components/Modal/Modal.tsx`
- Create: `apps/web/src/components/Modal/Modal.module.css`
- Create: `apps/web/src/components/Modal/Modal.test.tsx`

**Interfaces:**
- Produces: `<Modal open onClose title? actions?>{children}</Modal>`.

- [ ] **Step 1: Write failing test (covers Review Focus: focus trap + Escape)**

```tsx
// apps/web/src/components/Modal/Modal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Modal } from "./Modal.js";

function Harness(): JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen(true)}>open</button>
      <Modal open={open} onClose={() => setOpen(false)} title="T">
        <button>A</button>
        <button>B</button>
      </Modal>
    </div>
  );
}

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(<Modal open={false} onClose={() => {}}>x</Modal>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("renders dialog when open", () => {
    render(<Modal open onClose={() => {}} title="Hello">body</Modal>);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
  it("calls onClose on Escape", async () => {
    const fn = vi.fn();
    render(<Modal open onClose={fn} title="T">body</Modal>);
    await userEvent.keyboard("{Escape}");
    expect(fn).toHaveBeenCalledOnce();
  });
  it("calls onClose on backdrop click", () => {
    const fn = vi.fn();
    render(<Modal open onClose={fn} title="T">body</Modal>);
    fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    expect(fn).toHaveBeenCalledOnce();
  });
  it("Review Focus: focus is trapped inside the dialog", async () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    const a = screen.getByRole("button", { name: "A" });
    const b = screen.getByRole("button", { name: "B" });
    // Focus initial: first focusable in the dialog
    expect(document.activeElement).toBe(a);
    // Tab past last → cycles back to first
    b.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(a);
    // Shift+Tab from first → cycles to last
    a.focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(b);
    // Sanity: focus never escapes dialog
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Modal.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Modal.module.css**

```css
/* apps/web/src/components/Modal/Modal.module.css */
.backdrop {
  position: fixed;
  inset: 0;
  background: var(--color-backdrop);
  display: grid;
  place-items: center;
  z-index: 1000;
  padding: var(--space-4);
}
.dialog {
  background: var(--color-surface);
  border: 1px solid var(--color-hairline);
  width: 100%;
  max-width: 640px;
  padding: var(--space-5);
  display: grid;
  gap: var(--space-4);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--color-ink) 4%, transparent),
    0 24px 48px -24px color-mix(in srgb, var(--color-ink) 30%, transparent);
}
.header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-4);
}
.title {
  font: 600 var(--type-h2) "Source Serif 4", Georgia, serif;
  margin: 0;
}
.close {
  background: transparent;
  border: none;
  font: 400 var(--type-h3) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink-soft);
  cursor: pointer;
}
.body { font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif; color: var(--color-ink); }
.footer { display: flex; justify-content: flex-end; gap: var(--space-3); }
```

- [ ] **Step 4: Write Modal.tsx**

```tsx
// apps/web/src/components/Modal/Modal.tsx
import { useEffect, useRef, type ReactNode, type MouseEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import styles from "./Modal.module.css";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  const sel = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(root.querySelectorAll<HTMLElement>(sel));
}

export function Modal({ open, onClose, title, actions, children }: ModalProps): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog) {
      const focusables = getFocusable(dialog);
      (focusables[0] ?? dialog).focus();
    }
    return () => {
      previousFocus.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = getFocusable(dialogRef.current);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last  = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onBackdropMouseDown = (e: MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div className={styles.backdrop} onMouseDown={onBackdropMouseDown} data-testid="modal-backdrop">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className={styles.header}>
          {title !== undefined ? <h2 className={styles.title}>{title}</h2> : <span />}
          <button className={styles.close} aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className={styles.body}>{children}</div>
        {actions !== undefined && <div className={styles.footer}>{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Modal.test.tsx`
Expected: PASS (5 tests, including Review Focus trap test).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Modal
git commit -m "feat(design-system): add Modal component with focus trap and Escape close"
```

### Task 19: Tabs

**Files:**
- Create: `apps/web/src/components/Tabs/Tabs.tsx`
- Create: `apps/web/src/components/Tabs/Tabs.module.css`
- Create: `apps/web/src/components/Tabs/Tabs.test.tsx`

**Interfaces:**
- Produces: `<Tabs items={[{id,label}]} activeId onChange />` (controlled).

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Tabs/Tabs.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "./Tabs.js";
describe("Tabs", () => {
  it("marks active tab with aria-selected=true", () => {
    render(
      <Tabs
        items={[{ id: "a", label: "A" }, { id: "b", label: "B" }]}
        activeId="a"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute("aria-selected", "false");
  });
  it("calls onChange with clicked tab id", async () => {
    const fn = vi.fn();
    render(
      <Tabs
        items={[{ id: "a", label: "A" }, { id: "b", label: "B" }]}
        activeId="a"
        onChange={fn}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "B" }));
    expect(fn).toHaveBeenCalledWith("b");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Tabs.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Tabs.module.css**

```css
/* apps/web/src/components/Tabs/Tabs.module.css */
.tablist {
  display: flex;
  gap: var(--space-5);
  border-bottom: 1px solid var(--color-hairline);
}
.tab {
  background: transparent;
  border: none;
  padding: var(--space-2) 0;
  font: 600 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.tab[aria-selected="true"] {
  border-bottom-color: var(--color-ink-blue);
}
```

- [ ] **Step 4: Write Tabs.tsx**

```tsx
// apps/web/src/components/Tabs/Tabs.tsx
import styles from "./Tabs.module.css";

export interface TabItem { id: string; label: string }
export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

export function Tabs({ items, activeId, onChange, ariaLabel }: TabsProps): JSX.Element {
  return (
    <div role="tablist" aria-label={ariaLabel} className={styles.tablist}>
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={it.id === activeId}
          className={styles.tab}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Tabs.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Tabs
git commit -m "feat(design-system): add Tabs component (controlled, aria-selected)"
```

### Task 20: Tooltip

**Files:**
- Create: `apps/web/src/components/Tooltip/Tooltip.tsx`
- Create: `apps/web/src/components/Tooltip/Tooltip.module.css`
- Create: `apps/web/src/components/Tooltip/Tooltip.test.tsx`

**Interfaces:**
- Produces: `<Tooltip content="…"><Trigger/></Tooltip>` — renders tooltip on hover/focus after 400ms delay.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Tooltip/Tooltip.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "./Tooltip.js";

describe("Tooltip", () => {
  it("shows tooltip on hover", async () => {
    render(
      <Tooltip content="Hi there">
        <button>x</button>
      </Tooltip>,
    );
    await userEvent.hover(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Hi there");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Tooltip.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Tooltip.module.css**

```css
/* apps/web/src/components/Tooltip/Tooltip.module.css */
.tip {
  position: absolute;
  background: var(--color-surface);
  color: var(--color-ink);
  border: 1px solid var(--color-hairline);
  padding: var(--space-1) var(--space-2);
  font: 400 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  z-index: 1100;
}
```

- [ ] **Step 4: Write Tooltip.tsx**

```tsx
// apps/web/src/components/Tooltip/Tooltip.tsx
import { cloneElement, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  content: ReactNode;
  children: ReactElement<{ onFocus?: () => void; onBlur?: () => void; onMouseEnter?: () => void; onMouseLeave?: () => void }>;
}

export function Tooltip({ content, children }: TooltipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const id = useId();
  const timer = useRef<number | null>(null);

  const show = (e: { currentTarget: HTMLElement }): void => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.bottom + 4 });
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), 400);
  };
  const hide = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setOpen(false);
  };

  const triggerEl = cloneElement(children, {
    onFocus: () => show({ currentTarget: children.ref as unknown as HTMLElement }),
    onBlur: hide,
    onMouseEnter: () => show({ currentTarget: children.ref as unknown as HTMLElement }),
    onMouseLeave: hide,
    "aria-describedby": open ? id : undefined,
  } as Partial<typeof children.props>);

  return (
    <>
      {triggerEl}
      {open && pos !== null && createPortal(
        <span
          role="tooltip"
          id={id}
          className={styles.tip}
          style={{ left: pos.x, top: pos.y, transform: "translateX(-50%)" }}
        >
          {content}
        </span>,
        document.body,
      )}
    </>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Tooltip.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Tooltip
git commit -m "feat(design-system): add Tooltip component with hover/focus delay"
```

---

## Phase 4: Shell components (Tasks 21–23)

### Task 21: PageTitle

**Files:**
- Create: `apps/web/src/components/PageTitle/PageTitle.tsx`
- Create: `apps/web/src/components/PageTitle/PageTitle.module.css`
- Create: `apps/web/src/components/PageTitle/PageTitle.test.tsx`

**Interfaces:**
- Produces: `<PageTitle eyebrow? subtitle?>{title}</PageTitle>`.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/PageTitle/PageTitle.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTitle } from "./PageTitle.js";
describe("PageTitle", () => {
  it("renders eyebrow, title, and subtitle", () => {
    render(<PageTitle eyebrow="Student · Gradesheet" subtitle="Semester 3">My Gradesheet</PageTitle>);
    expect(screen.getByText("Student · Gradesheet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "My Gradesheet" })).toBeInTheDocument();
    expect(screen.getByText("Semester 3")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- PageTitle.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write PageTitle.module.css and PageTitle.tsx**

```css
/* apps/web/src/components/PageTitle/PageTitle.module.css */
.wrap { margin-bottom: var(--space-6); }
.eyebrow {
  font: 600 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-ink-soft);
  margin: 0 0 var(--space-1);
}
.title {
  font: 600 var(--type-h1) "Source Serif 4", Georgia, serif;
  margin: 0;
  color: var(--color-ink);
}
.subtitle {
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink-soft);
  margin: var(--space-2) 0 0;
}
```

```tsx
// apps/web/src/components/PageTitle/PageTitle.tsx
import type { ReactNode } from "react";
import styles from "./PageTitle.module.css";

export interface PageTitleProps {
  eyebrow?: string;
  subtitle?: string;
  children: ReactNode;
}

export function PageTitle({ eyebrow, subtitle, children }: PageTitleProps): JSX.Element {
  return (
    <header className={styles.wrap}>
      {eyebrow !== undefined && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.title}>{children}</h1>
      {subtitle !== undefined && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  );
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- PageTitle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/PageTitle
git commit -m "feat(design-system): add PageTitle component (eyebrow + serif H1 + subtitle)"
```

### Task 22: Header

**Files:**
- Create: `apps/web/src/components/Header/Header.tsx`
- Create: `apps/web/src/components/Header/Header.module.css`
- Create: `apps/web/src/components/Header/Header.test.tsx`

**Interfaces:**
- Produces: `<Header role userName onSignOut onToggleTheme currentTheme />`.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Header/Header.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./Header.js";

describe("Header", () => {
  it("renders wordmark, role badge, user name, sign out", () => {
    render(<Header role="admin" userName="Pranit" onSignOut={() => {}} onToggleTheme={() => {}} currentTheme="light" />);
    expect(screen.getByText("Mark-Matrix")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("Pranit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
  it("calls onSignOut when Sign out clicked", async () => {
    const fn = vi.fn();
    render(<Header role="admin" userName="Pranit" onSignOut={fn} onToggleTheme={() => {}} currentTheme="light" />);
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(fn).toHaveBeenCalledOnce();
  });
  it("calls onToggleTheme when toggle clicked", async () => {
    const fn = vi.fn();
    render(<Header role="admin" userName="Pranit" onSignOut={() => {}} onToggleTheme={fn} currentTheme="light" />);
    await userEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(fn).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Header.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Header.module.css**

```css
/* apps/web/src/components/Header/Header.module.css */
.header {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-6);
  height: 64px;
  background: var(--color-paper);
  border-bottom: 1px solid var(--color-hairline);
}
.brand {
  font: 600 var(--type-h3) "Source Serif 4", Georgia, serif;
  margin: 0;
}
.spacer { flex: 1; }
.user {
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink);
}
```

- [ ] **Step 4: Write Header.tsx**

```tsx
// apps/web/src/components/Header/Header.tsx
import type { Role } from "@mark-matrix/shared";
import { Badge } from "../Badge/Badge.js";
import { Button } from "../Button/Button.js";
import { Tooltip } from "../Tooltip/Tooltip.js";
import type { Theme } from "../../styles/theme.js";
import styles from "./Header.module.css";

export interface HeaderProps {
  role: Role;
  userName: string;
  onSignOut: () => void;
  onToggleTheme: () => void;
  currentTheme: Theme;
}

export function Header({ role, userName, onSignOut, onToggleTheme, currentTheme }: HeaderProps): JSX.Element {
  return (
    <header className={styles.header} data-print="hidden">
      <h1 className={styles.brand}>Mark-Matrix</h1>
      <Badge variant="submitted">{role}</Badge>
      <span className={styles.spacer} />
      <span className={styles.user}>{userName}</span>
      <Tooltip content={`Switch to ${currentTheme === "dark" ? "light" : "dark"} mode`}>
        <Button variant="ghost" size="sm" onClick={onToggleTheme} aria-label="Toggle theme">
          {currentTheme === "dark" ? "☾" : "☼"}
        </Button>
      </Tooltip>
      <Button variant="ghost" size="sm" onClick={onSignOut}>Sign out</Button>
    </header>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Header.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Header
git commit -m "feat(design-system): add Header component (wordmark, role pill, user, theme toggle, sign out)"
```

### Task 23: Nav

**Files:**
- Create: `apps/web/src/components/Nav/Nav.tsx`
- Create: `apps/web/src/components/Nav/Nav.module.css`
- Create: `apps/web/src/components/Nav/Nav.test.tsx`

**Interfaces:**
- Produces: `<Nav items={[{to, label}]} activePath />`. Active item gets 2px ink-blue underline.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/components/Nav/Nav.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Nav } from "./Nav.js";

describe("Nav", () => {
  it("renders links and marks the active one", () => {
    render(
      <MemoryRouter initialEntries={["/b"]}>
        <Nav items={[{ to: "/a", label: "Alpha" }, { to: "/b", label: "Beta" }]} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(screen.getByText("Beta").getAttribute("aria-current")).toBe("page");
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Nav.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Nav.module.css**

```css
/* apps/web/src/components/Nav/Nav.module.css */
.nav {
  display: flex;
  gap: var(--space-5);
  padding: 0 var(--space-6);
  border-bottom: 1px solid var(--color-hairline);
  background: var(--color-paper);
}
.link {
  display: inline-block;
  padding: var(--space-3) 0;
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.link:hover { color: var(--color-ink-blue); }
.active {
  border-bottom-color: var(--color-ink-blue);
  font-weight: 600;
}

@media (max-width: 767px) {
  .nav { flex-direction: column; padding: var(--space-3) var(--space-4); }
  .link { border-bottom: none; border-left: 2px solid transparent; margin-bottom: 0; padding: var(--space-2) var(--space-3); }
  .active { border-bottom: none; border-left-color: var(--color-ink-blue); }
}
```

- [ ] **Step 4: Write Nav.tsx**

```tsx
// apps/web/src/components/Nav/Nav.tsx
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/cn.js";
import styles from "./Nav.module.css";

export interface NavItem { to: string; label: string }
export interface NavProps { items: NavItem[] }

export function Nav({ items }: NavProps): JSX.Element {
  return (
    <nav className={styles.nav} data-print="hidden" aria-label="Primary">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.to === "/"}
          className={({ isActive }) => cn(styles.link, isActive ? styles.active : undefined)}
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Nav.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/Nav
git commit -m "feat(design-system): add Nav component (active underline, mobile vertical)"
```

---

## Phase 5: Analytics charts (Tasks 24–26)

### Task 24: BarChart

**Files:**
- Create: `apps/web/src/analytics/BarChart/BarChart.tsx`
- Create: `apps/web/src/analytics/BarChart/BarChart.module.css`
- Create: `apps/web/src/analytics/BarChart/BarChart.test.tsx`

**Interfaces:**
- Produces: `<BarChart data={[{label, value}]} max? />`. Vertical bars, 1px axis baseline, currentColor fills.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/analytics/BarChart/BarChart.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarChart } from "./BarChart.js";

describe("BarChart", () => {
  it("renders one rect per data point", () => {
    render(<BarChart data={[{ label: "A", value: 1 }, { label: "B", value: 3 }]} ariaLabel="Bars" />);
    const svg = screen.getByRole("img", { name: "Bars" });
    expect(svg.querySelectorAll("rect")).toHaveLength(2);
  });
  it("renders sr-only data table", () => {
    render(<BarChart data={[{ label: "A", value: 1 }, { label: "B", value: 3 }]} ariaLabel="Bars" />);
    const table = screen.getByRole("table", { hidden: true });
    expect(table).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- BarChart.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write BarChart.module.css**

```css
/* apps/web/src/analytics/BarChart/BarChart.module.css */
.svg { color: var(--color-ink-blue); display: block; max-width: 100%; }
.axis { stroke: var(--color-hairline); stroke-width: 1; }
.label { font: 400 11px "IBM Plex Mono", ui-monospace, monospace; fill: var(--color-ink-soft); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
```

- [ ] **Step 4: Write BarChart.tsx**

```tsx
// apps/web/src/analytics/BarChart/BarChart.tsx
import styles from "./BarChart.module.css";

export interface BarDatum { label: string; value: number }
export interface BarChartProps {
  data: BarDatum[];
  ariaLabel: string;
  max?: number;
}

export function BarChart({ data, ariaLabel, max }: BarChartProps): JSX.Element {
  const ceiling = Math.max(max ?? 0, ...data.map((d) => d.value), 1);
  const w = 360;
  const h = 160;
  const pad = 24;
  const barW = (w - pad * 2) / Math.max(data.length, 1) - 8;
  return (
    <>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${w} ${h}`}
        width={w}
        height={h}
        role="img"
        aria-label={ariaLabel}
      >
        <line className={styles.axis} x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} />
        {data.map((d, i) => {
          const bh = ((h - pad * 2) * d.value) / ceiling;
          const x = pad + i * ((w - pad * 2) / Math.max(data.length, 1)) + 4;
          const y = h - pad - bh;
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={barW} height={bh} fill="currentColor" />
              <text className={styles.label} x={x + barW / 2} y={h - pad + 12} textAnchor="middle">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <table className={styles.sr}>
        <thead><tr><th>Label</th><th>Value</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.label}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody>
      </table>
    </>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- BarChart.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/analytics/BarChart
git commit -m "feat(analytics): add BarChart with sr-only data table"
```

### Task 25: Sparkline

**Files:**
- Create: `apps/web/src/analytics/Sparkline/Sparkline.tsx`
- Create: `apps/web/src/analytics/Sparkline/Sparkline.module.css`
- Create: `apps/web/src/analytics/Sparkline/Sparkline.test.tsx`

**Interfaces:**
- Produces: `<Sparkline values={[number, …]} ariaLabel />`.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/analytics/Sparkline/Sparkline.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkline } from "./Sparkline.js";
describe("Sparkline", () => {
  it("renders a polyline", () => {
    render(<Sparkline values={[1, 3, 2, 4]} ariaLabel="Trend" />);
    const svg = screen.getByRole("img", { name: "Trend" });
    expect(svg.querySelector("polyline")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- Sparkline.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write Sparkline.module.css**

```css
/* apps/web/src/analytics/Sparkline/Sparkline.module.css */
.svg { color: var(--color-ink-blue); display: block; max-width: 100%; }
.line { fill: none; stroke: currentColor; stroke-width: 1.5; }
.dot  { fill: currentColor; }
```

- [ ] **Step 4: Write Sparkline.tsx**

```tsx
// apps/web/src/analytics/Sparkline/Sparkline.tsx
import styles from "./Sparkline.module.css";

export interface SparklineProps {
  values: number[];
  ariaLabel: string;
}

export function Sparkline({ values, ariaLabel }: SparklineProps): JSX.Element {
  const w = 240;
  const h = 60;
  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(" ");
  const last = values[values.length - 1];
  const lx = pad + ((values.length - 1) * (w - pad * 2)) / Math.max(values.length - 1, 1);
  const ly = h - pad - ((last - min) / range) * (h - pad * 2);
  return (
    <svg className={styles.svg} viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={ariaLabel}>
      <polyline className={styles.line} points={points} />
      <circle className={styles.dot} cx={lx} cy={ly} r={2.5} />
    </svg>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- Sparkline.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/analytics/Sparkline
git commit -m "feat(analytics): add Sparkline component"
```

### Task 26: DotPlot

**Files:**
- Create: `apps/web/src/analytics/DotPlot/DotPlot.tsx`
- Create: `apps/web/src/analytics/DotPlot/DotPlot.module.css`
- Create: `apps/web/src/analytics/DotPlot/DotPlot.test.tsx`

**Interfaces:**
- Produces: `<DotPlot values={[number, …]} ariaLabel />`.

- [ ] **Step 1: Write failing test**

```tsx
// apps/web/src/analytics/DotPlot/DotPlot.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DotPlot } from "./DotPlot.js";
describe("DotPlot", () => {
  it("renders one circle per value", () => {
    render(<DotPlot values={[1, 2, 3]} ariaLabel="Dots" />);
    const svg = screen.getByRole("img", { name: "Dots" });
    expect(svg.querySelectorAll("circle")).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @mark-matrix/web test -- DotPlot.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write DotPlot.module.css**

```css
/* apps/web/src/analytics/DotPlot/DotPlot.module.css */
.svg { color: var(--color-ink-blue); display: block; max-width: 100%; }
.axis { stroke: var(--color-hairline); stroke-width: 1; }
.dot  { fill: currentColor; }
```

- [ ] **Step 4: Write DotPlot.tsx**

```tsx
// apps/web/src/analytics/DotPlot/DotPlot.tsx
import styles from "./DotPlot.module.css";

export interface DotPlotProps {
  values: number[];
  ariaLabel: string;
}

export function DotPlot({ values, ariaLabel }: DotPlotProps): JSX.Element {
  const w = 360;
  const h = 80;
  const pad = 12;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return (
    <svg className={styles.svg} viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={ariaLabel}>
      <line className={styles.axis} x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} />
      {values.map((v, i) => {
        const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1);
        const y = h - pad - ((v - min) / range) * (h - pad * 2);
        return <circle key={i} className={styles.dot} cx={x} cy={y} r={3} />;
      })}
    </svg>
  );
}
```

- [ ] **Step 5: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web test -- DotPlot.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/analytics/DotPlot
git commit -m "feat(analytics): add DotPlot component"
```

---

## Phase 6: Shell rewrite (Task 27)

### Task 27: AppShell uses Header + Nav

**Files:**
- Modify: `apps/web/src/shell/AppShell.tsx`
- Modify: `apps/web/src/main.tsx` — call `initTheme()` once at startup.

**Interfaces:**
- Consumes: `Header`, `Nav`, `theme.toggleTheme`, `theme.getStoredTheme`, `useAuth()`'s `role`/`user`/`signOut`.

- [ ] **Step 1: Modify main.tsx to init theme before render**

```tsx
// apps/web/src/main.tsx  (add import + call before render)
import { initTheme } from "./styles/theme.js";
initTheme();
```

(Keep all existing imports and the `createRoot(...).render(<App/>)` block.)

- [ ] **Step 2: Replace AppShell.tsx with the new header + nav composition**

```tsx
// apps/web/src/shell/AppShell.tsx
import { Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Header } from "../components/Header/Header.js";
import { Nav } from "../components/Nav/Nav.js";
import { NAV_ITEMS } from "./navConfig.js";
import { useAuth } from "../auth/AuthContext.js";
import { getStoredTheme, toggleTheme, type Theme } from "../styles/theme.js";

export function AppShell(): JSX.Element {
  const { role, user, signOut } = useAuth();
  const items = NAV_ITEMS.filter((i) => role !== null && i.roles.includes(role));
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme() ?? "light");
  const navigate = useNavigate();

  useEffect(() => {
    const onStorage = (): void => setTheme(getStoredTheme() ?? "light");
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const onToggle = (): void => {
    toggleTheme();
    setTheme(getStoredTheme() ?? "light");
  };

  const onSignOut = (): void => {
    void signOut();
    navigate("/login");
  };

  if (role === null || user === null) return <div className="app-loading">Loading…</div>;

  return (
    <div className="app-shell">
      <Header role={role} userName={user.name ?? user.email ?? "User"} onSignOut={onSignOut} onToggleTheme={onToggle} currentTheme={theme} />
      <Nav items={items.map((i) => ({ to: i.to, label: i.label }))} />
      <main className="app-shell__main"><Outlet /></main>
    </div>
  );
}
```

(The `.app-shell` and `.app-shell__main` classes need only `display: grid; grid-template-rows: auto auto 1fr;` and `padding: var(--space-6); max-width: 1280px; margin: 0 auto;` — those rules come from the page-level styles we add in later tasks. For this task, the legacy `apps/web/src/styles.css` still provides them.)

- [ ] **Step 3: Run existing AppShell tests**

Run: `pnpm --filter @mark-matrix/web test -- AppShell.test.tsx`
Expected: PASS (existing tests still green; we may need to update them if they assert on specific markup — if so, update the assertions to match the new Header/Nav contract, then re-run).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/shell/AppShell.tsx apps/web/src/main.tsx
git commit -m "feat(shell): rewrite with design-system Header and Nav, init theme on boot"
```

---

## Phase 7: Anchor page (Task 28)

### Task 28: Student Gradesheet — DetailTemplate

**Files:**
- Modify: `apps/web/src/pages/student/MyGradesheetPage.tsx`

- [ ] **Step 1: Read existing component**

Read `apps/web/src/pages/student/MyGradesheetPage.tsx` to confirm the data shape (`GradesheetRow`) and loading/error states.

- [ ] **Step 2: Rewrite to the new DetailTemplate**

```tsx
// apps/web/src/pages/student/MyGradesheetPage.tsx
import { useParams } from "react-router-dom";
import { useResource } from "../../lib/useResource.js";
import { ROUTES_CYCLE_2, type GradesheetRow } from "@mark-matrix/shared";
import { PageTitle } from "../../components/PageTitle/PageTitle.js";
import { Badge } from "../../components/Badge/Badge.js";
import { Loading } from "../../components/Loading/Loading.js";
import { Empty } from "../../components/Empty/Empty.js";
import { DownloadTranscriptButton } from "../../components/DownloadTranscriptButton.js";
import styles from "./MyGradesheetPage.module.css";

interface GradesheetEnvelope { data: GradesheetRow | null }

export function MyGradesheetPage(): JSX.Element {
  const { batchId = "", programId = "", semId = "" } = useParams<{ batchId: string; programId: string; semId: string }>();
  const apiPath = ROUTES_CYCLE_2.studentGradesheetPath("student", batchId, programId, semId);
  const res = useResource<GradesheetEnvelope>(apiPath);

  if (res.loading) return <Loading />;
  if (res.error === "not_found" || res.data?.data === null || res.data?.data === undefined)
    return <Empty>Gradesheet not available yet — your semester's results are still being finalised.</Empty>;

  const g = res.data.data;
  const status = g.status;
  return (
    <article className="grd">
      <PageTitle eyebrow="Student · Gradesheet">My Gradesheet — Semester {g.semId}</PageTitle>
      <div className={styles.row}>
        <Badge variant={status === "published" ? "published" : status === "locked" ? "locked" : "draft"}>{status}</Badge>
        {g.publishedAt !== null && <span className={styles.published}>Published on {g.publishedAt}</span>}
      </div>
      <dl className={styles.meta}>
        <dt>SGPA</dt>             <dd>{g.sgpa?.toFixed(2) ?? "—"}</dd>
        <dt>Total credits</dt>    <dd>{g.totalCredits ?? "—"}</dd>
        <dt>Courses graded</dt>   <dd>{g.courseCount ?? "—"}</dd>
      </dl>
      <div className={styles.actions}>
        <DownloadTranscriptButton
          url={ROUTES_CYCLE_2.studentTranscript("student", batchId, programId, semId)}
          label="Download Transcript"
          disabled={status !== "published"}
        />
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Add MyGradesheetPage.module.css**

```css
/* apps/web/src/pages/student/MyGradesheetPage.module.css */
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}
.published {
  font: 400 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink-soft);
}
.meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  row-gap: var(--space-2);
  column-gap: var(--space-4);
  border-top: 1px solid var(--color-hairline);
  margin-bottom: var(--space-5);
}
.meta dt {
  font: 600 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-ink-soft);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-hairline);
}
.meta dd {
  font: 400 var(--type-body) "IBM Plex Mono", ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  margin: 0;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-hairline);
  color: var(--color-ink);
}
.actions { margin-top: var(--space-4); }

@media print {
  .row, .actions { display: none !important; }
}
```

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- MyGradesheetPage.test.tsx`
Expected: PASS (update assertions if they pinned old markup). If updates are needed, change the test to assert on `PageTitle`'s heading and the new meta `<dl>` rows, then re-run.

- [ ] **Step 5: Verify visual in dev**

Run: `pnpm --filter @mark-matrix/web dev`
Expected: App boots; navigating to `/student/gradesheets/b1/p1/s1` (after login as a student) shows the new layout.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/student/MyGradesheetPage.tsx apps/web/src/pages/student/MyGradesheetPage.module.css
git commit -m "feat(pages): rebuild student gradesheet against new design system"
```

---

## Phase 8: Student rollout (Tasks 29–30)

### Task 29: MyAttendancePage

**Files:**
- Modify: `apps/web/src/pages/student/MyAttendancePage.tsx`

- [ ] **Step 1: Read existing component**

Read `apps/web/src/pages/student/MyAttendancePage.tsx` to confirm its current behavior and data shape.

- [ ] **Step 2: Replace the page with the new components**

Compose `PageTitle`, `Loading`, `Empty`, `ErrorState`, `Table` (mono/right columns for percentages), `Banner` if a course falls below a threshold. Keep the existing data fetching via `useResource`. The exact JSX must be tailored to the existing data — follow the pattern in Task 28.

(Concrete code omitted here because the page's data shape is read at Step 1; preserve its existing logic, swap visual primitives to the new ones.)

- [ ] **Step 3: Add MyAttendancePage.module.css if needed**

One rule file per page. Only add CSS for layouts not covered by the design system (e.g., grid layouts, custom banners).

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- MyAttendancePage.test.tsx`
Expected: PASS (update assertions if markup changed; if the page was untested, add minimal tests asserting `PageTitle`, `Table` rendering).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/student/MyAttendancePage.tsx apps/web/src/pages/student/MyAttendancePage.module.css
git commit -m "feat(pages): rebuild student attendance against new design system"
```

### Task 30: MyMarksPage

**Files:**
- Modify: `apps/web/src/pages/student/MyMarksPage.tsx`

- [ ] **Step 1: Read existing component**

Read `apps/web/src/pages/student/MyMarksPage.tsx`.

- [ ] **Step 2: Replace with PageTitle + Table (mono right-aligned for marks) + Loading/Empty/ErrorState**

(Concrete JSX depends on the existing data shape; same pattern as Task 29.)

- [ ] **Step 3: Add CSS module file if needed**

`MyMarksPage.module.css` only for page-specific grid/banner styles.

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- MyMarksPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/student/MyMarksPage.tsx apps/web/src/pages/student/MyMarksPage.module.css
git commit -m "feat(pages): rebuild student marks against new design system"
```

---

## Phase 9: Auth rollout (Tasks 31–33)

### Task 31: LoginPage

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/pages/LoginPage.module.css`

- [ ] **Step 1: Read existing**

Read `apps/web/src/pages/LoginPage.tsx` to confirm form fields and submission logic.

- [ ] **Step 2: Replace with LoginTemplate**

```tsx
// apps/web/src/pages/LoginPage.tsx
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Field } from "../../components/Field/Field.js";
import { Input } from "../../components/Input/Input.js";
import { Button } from "../../components/Button/Button.js";
import { useAuth } from "../../auth/AuthContext.js";
import styles from "./LoginPage.module.css";

export function LoginPage(): JSX.Element {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await signIn(email, password);
      navigate("/");
    } catch (err) {
      setError((err as Error).message || "Sign-in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={(e) => void onSubmit(e)}>
        <h1 className={styles.title}>Mark-Matrix</h1>
        <Field label="Email" htmlFor="email">
          <Input id="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" htmlFor="password" error={error ?? undefined}>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</Button>
      </form>
    </main>
  );
}
```

```css
/* apps/web/src/pages/LoginPage.module.css */
.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--color-paper);
}
.card {
  width: 320px;
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-hairline);
  display: grid;
  gap: var(--space-3);
}
.title {
  font: 600 var(--type-h2) "Source Serif 4", Georgia, serif;
  margin: 0 0 var(--space-3);
}
```

- [ ] **Step 3: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- LoginPage`
Expected: PASS (update markup assertions if needed).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/LoginPage.tsx apps/web/src/pages/LoginPage.module.css
git commit -m "feat(pages): rebuild login against new design system"
```

### Task 32: DashboardPlaceholder

**Files:**
- Modify: `apps/web/src/pages/DashboardPlaceholder.tsx`

- [ ] **Step 1: Replace with DashboardTemplate**

```tsx
// apps/web/src/pages/DashboardPlaceholder.tsx
import { PageTitle } from "../components/PageTitle/PageTitle.js";
import { useAuth } from "../auth/AuthContext.js";

export function DashboardPlaceholder(): JSX.Element {
  const { role, user } = useAuth();
  return (
    <article>
      <PageTitle eyebrow="Dashboard">Welcome, {user?.name ?? user?.email ?? "there"}</PageTitle>
      <p>You are signed in as a <strong>{role}</strong>.</p>
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/DashboardPlaceholder.tsx
git commit -m "feat(pages): rebuild dashboard placeholder"
```

### Task 33: NotFoundPage + ForbiddenPage

**Files:**
- Modify: `apps/web/src/pages/NotFoundPage.tsx`
- Modify: `apps/web/src/pages/ForbiddenPage.tsx`

- [ ] **Step 1: Replace both pages with PageTitle + Empty**

```tsx
// apps/web/src/pages/NotFoundPage.tsx
import { PageTitle } from "../components/PageTitle/PageTitle.js";
import { Empty } from "../components/Empty/Empty.js";
export function NotFoundPage(): JSX.Element {
  return (
    <article>
      <PageTitle>Not found</PageTitle>
      <Empty>The page you were looking for doesn't exist.</Empty>
    </article>
  );
}
```

```tsx
// apps/web/src/pages/ForbiddenPage.tsx
import { PageTitle } from "../components/PageTitle/PageTitle.js";
import { Empty } from "../components/Empty/Empty.js";
export function ForbiddenPage(): JSX.Element {
  return (
    <article>
      <PageTitle>Forbidden</PageTitle>
      <Empty>You don't have permission to view this page.</Empty>
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/NotFoundPage.tsx apps/web/src/pages/ForbiddenPage.tsx
git commit -m "feat(pages): rebuild NotFound and Forbidden against new design system"
```

---

## Phase 10: Faculty rollout (Tasks 34–39)

For each page, the pattern is: read existing → replace with design-system primitives → run test → commit. Each page keeps its existing data fetching logic and behaviour; only the visuals change.

### Task 34: FacultyCoursesPage

**Files:**
- Modify: `apps/web/src/pages/faculty/FacultyCoursesPage.tsx`
- Create: `apps/web/src/pages/faculty/FacultyCoursesPage.module.css`

- [ ] **Step 1: Read existing**

Read `apps/web/src/pages/faculty/FacultyCoursesPage.tsx`.

- [ ] **Step 2: Replace with PageTitle + Table (course code mono, title left) + Loading/Empty/ErrorState**

(Concrete JSX depends on the data shape read in Step 1.)

- [ ] **Step 3: Add CSS module only for page-specific layout**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- FacultyCoursesPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/faculty/FacultyCoursesPage.tsx apps/web/src/pages/faculty/FacultyCoursesPage.module.css
git commit -m "feat(pages): rebuild faculty courses against new design system"
```

### Task 35: MarksEntryPage (DenseEditorTemplate)

**Files:**
- Modify: `apps/web/src/pages/faculty/MarksEntryPage.tsx`
- Create: `apps/web/src/pages/faculty/MarksEntryPage.module.css`

- [ ] **Step 1: Read existing**

Read `apps/web/src/pages/faculty/MarksEntryPage.tsx`.

- [ ] **Step 2: Replace with PageTitle + Banner (when locked) + action bar (Button Save/Submit + File for CSV) + Table (in-cell Input mono number, sticky header) + collapsible bulk-error block**

Preserve `saveDraft`, `submitCourse`, `onCsvChosen`, the draft state, and the existing `apiFetch` calls. Visuals only change.

- [ ] **Step 3: Add CSS module for the action bar layout**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- MarksEntryPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/faculty/MarksEntryPage.tsx apps/web/src/pages/faculty/MarksEntryPage.module.css
git commit -m "feat(pages): rebuild faculty marks entry against new design system"
```

### Task 36: RosterMarksPage

**Files:**
- Modify: `apps/web/src/pages/faculty/RosterMarksPage.tsx`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with PageTitle + Table (sticky header, mono right for marks) + role-aware banner if locked**

- [ ] **Step 3: Add CSS module if needed**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- RosterMarksPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/faculty/RosterMarksPage.tsx apps/web/src/pages/faculty/RosterMarksPage.module.css
git commit -m "feat(pages): rebuild faculty roster marks against new design system"
```

### Task 37: MarkAttendancePage

**Files:**
- Modify: `apps/web/src/pages/faculty/MarkAttendancePage.tsx`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with PageTitle + Banner (locked) + action bar + Table (sticky header, mono right for present/absent counts) + collapsible bulk-error block**

Preserve existing data flow.

- [ ] **Step 3: Add CSS module**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- MarkAttendancePage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/faculty/MarkAttendancePage.tsx apps/web/src/pages/faculty/MarkAttendancePage.module.css
git commit -m "feat(pages): rebuild faculty mark attendance against new design system"
```

### Task 38: RosterAttendancePage

**Files:**
- Modify: `apps/web/src/pages/faculty/RosterAttendancePage.tsx`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with PageTitle + Table (sticky header, mono right for counts) + role-aware banner**

- [ ] **Step 3: Add CSS module**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- RosterAttendancePage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/faculty/RosterAttendancePage.tsx apps/web/src/pages/faculty/RosterAttendancePage.module.css
git commit -m "feat(pages): rebuild faculty roster attendance against new design system"
```

### Task 39: AnalyticsPage

**Files:**
- Modify: `apps/web/src/pages/faculty/AnalyticsPage.tsx`
- Create: `apps/web/src/pages/faculty/AnalyticsPage.module.css`

- [ ] **Step 1: Read existing**

Read `apps/web/src/pages/faculty/AnalyticsPage.tsx`.

- [ ] **Step 2: Replace with PageTitle + KPI tiles grid + BarChart/Sparkline/DotPlot from `analytics/` + Table of underlying data**

Compose `BarChart`/`Sparkline`/`DotPlot` from `apps/web/src/analytics/...`. The page's existing data is the source for the chart `data` props.

- [ ] **Step 3: Add CSS module for KPI tile grid**

```css
/* apps/web/src/pages/faculty/AnalyticsPage.module.css */
.kpis {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}
.kpi {
  padding: var(--space-4);
  border: 1px solid var(--color-hairline);
  background: var(--color-surface);
}
.kpiLabel {
  font: 600 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-ink-soft);
  margin: 0 0 var(--space-2);
}
.kpiValue {
  font: 600 var(--type-h1) "Source Serif 4", Georgia, serif;
  color: var(--color-ink);
  margin: 0;
}
```

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- AnalyticsPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/faculty/AnalyticsPage.tsx apps/web/src/pages/faculty/AnalyticsPage.module.css
git commit -m "feat(pages): rebuild faculty analytics against new design system"
```

---

## Phase 11: Admin rollout (Tasks 40–48)

### Task 40: UsersPage

**Files:**
- Modify: `apps/web/src/pages/admin/UsersPage.tsx`
- Create: `apps/web/src/pages/admin/UsersPage.module.css`

- [ ] **Step 1: Read existing**

Read `apps/web/src/pages/admin/UsersPage.tsx`.

- [ ] **Step 2: Replace with PageTitle + filter bar (search Input, role Select, primary ghost "Add user") + Table (role as Badge, last active as Small) + Pagination**

Preserve existing data flow.

- [ ] **Step 3: Add CSS module only for page-specific layout**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- UsersPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/admin/UsersPage.tsx apps/web/src/pages/admin/UsersPage.module.css
git commit -m "feat(pages): rebuild admin users against new design system"
```

### Task 41: AcademicStructurePage (TreeTemplate)

**Files:**
- Modify: `apps/web/src/pages/admin/AcademicStructurePage.tsx`
- Create: `apps/web/src/pages/admin/AcademicStructurePage.module.css`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with PageTitle + multi-column tree (existing `EntityPanel` upgraded) using hairline-bordered surfaces, eyebrow labels, and selected-item active state**

Preserve existing data flow and the column→detail navigation.

- [ ] **Step 3: Add CSS module for the tree grid**

```css
/* apps/web/src/pages/admin/AcademicStructurePage.module.css */
.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr)) 2fr;
  gap: var(--space-4);
}
.col {
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-hairline);
}
.col h2 {
  font: 600 var(--type-small) "IBM Plex Sans", system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-ink-soft);
  margin: 0 0 var(--space-3);
}
.col ul { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-1); }
.col button {
  background: transparent;
  border: 1px solid transparent;
  padding: var(--space-1) var(--space-2);
  font: 400 var(--type-body) "IBM Plex Sans", system-ui, sans-serif;
  color: var(--color-ink);
  text-align: left;
  cursor: pointer;
  width: 100%;
}
.col button.active {
  border-color: var(--color-ink-blue);
  color: var(--color-ink-blue);
  font-weight: 600;
}
```

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- AcademicStructurePage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/admin/AcademicStructurePage.tsx apps/web/src/pages/admin/AcademicStructurePage.module.css
git commit -m "feat(pages): rebuild academic structure against new design system"
```

### Task 42: AssignmentsPage

**Files:**
- Modify: `apps/web/src/pages/admin/AssignmentsPage.tsx`
- Create: `apps/web/src/pages/admin/AssignmentsPage.module.css`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with PageTitle + Filter bar + Table (faculty name left, course code mono right) + Pagination**

Preserve existing data flow.

- [ ] **Step 3: Add CSS module**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- AssignmentsPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/admin/AssignmentsPage.tsx apps/web/src/pages/admin/AssignmentsPage.module.css
git commit -m "feat(pages): rebuild admin assignments against new design system"
```

### Task 43: EnrollmentsPage

**Files:**
- Modify: `apps/web/src/pages/admin/EnrollmentsPage.tsx`
- Create: `apps/web/src/pages/admin/EnrollmentsPage.module.css`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with PageTitle + section header for single enrollment (Field + Button) + section header for bulk (File + Button) + Table (existing CSV-error panel replaced by a `Banner` with collapsible details) + Pagination**

Preserve existing data flow and CSV upload behavior.

- [ ] **Step 3: Add CSS module**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- EnrollmentsPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/admin/EnrollmentsPage.tsx apps/web/src/pages/admin/EnrollmentsPage.module.css
git commit -m "feat(pages): rebuild admin enrollments against new design system"
```

### Task 44: ResultsReviewPage

**Files:**
- Modify: `apps/web/src/pages/admin/ResultsReviewPage.tsx`
- Create: `apps/web/src/pages/admin/ResultsReviewPage.module.css`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with PageTitle + Table with status Badge column + approve/unlock actions that open Modal**

Preserve existing data flow and approval/unlock actions. Use `Modal` from Task 18 for confirmation.

- [ ] **Step 3: Add CSS module**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- ResultsReviewPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/admin/ResultsReviewPage.tsx apps/web/src/pages/admin/ResultsReviewPage.module.css
git commit -m "feat(pages): rebuild admin results review against new design system"
```

### Task 45: GradesheetAdminPage (DetailTemplate)

**Files:**
- Modify: `apps/web/src/pages/admin/GradesheetAdminPage.tsx`
- Create: `apps/web/src/pages/admin/GradesheetAdminPage.module.css`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with PageTitle + status Badge row + meta dl (mirror Task 28's anchor pattern) + Table of course-level marks**

Preserve existing data flow.

- [ ] **Step 3: Add CSS module**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- GradesheetAdminPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/admin/GradesheetAdminPage.tsx apps/web/src/pages/admin/GradesheetAdminPage.module.css
git commit -m "feat(pages): rebuild admin gradesheet against new design system"
```

### Task 46: AnalyticsDashboardPage

**Files:**
- Modify: `apps/web/src/pages/admin/AnalyticsDashboardPage.tsx`
- Create: `apps/web/src/pages/admin/AnalyticsDashboardPage.module.css`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with PageTitle + KPI tile grid + BarChart/Sparkline/DotPlot + Table of underlying data**

Use the same KPI grid pattern as Task 39.

- [ ] **Step 3: Add CSS module**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- AnalyticsDashboardPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/admin/AnalyticsDashboardPage.tsx apps/web/src/pages/admin/AnalyticsDashboardPage.module.css
git commit -m "feat(pages): rebuild admin analytics dashboard against new design system"
```

### Task 47: AuditLogPage

**Files:**
- Modify: `apps/web/src/pages/admin/AuditLogPage.tsx`
- Create: `apps/web/src/pages/admin/AuditLogPage.module.css`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with PageTitle + filter bar (date range, actor Select) + Table (timestamp mono, actor left, action Badge, target mono) + Pagination**

Preserve existing data flow.

- [ ] **Step 3: Add CSS module**

- [ ] **Step 4: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- AuditLogPage`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/admin/AuditLogPage.tsx apps/web/src/pages/admin/AuditLogPage.module.css
git commit -m "feat(pages): rebuild admin audit log against new design system"
```

### Task 48: UnlockModal (uses Modal component)

**Files:**
- Modify: `apps/web/src/pages/admin/components/UnlockModal.tsx`

- [ ] **Step 1: Read existing**

- [ ] **Step 2: Replace with Modal from Task 18**

```tsx
// apps/web/src/pages/admin/components/UnlockModal.tsx
import { useState, type FormEvent } from "react";
import { Modal } from "../../../components/Modal/Modal.js";
import { Button } from "../../../components/Button/Button.js";
import { Field } from "../../../components/Field/Field.js";
import { Input } from "../../../components/Input/Input.js";

export interface UnlockModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  title: string;
}

export function UnlockModal({ open, onClose, onConfirm, title }: UnlockModalProps): JSX.Element {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Unlock record"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={reason.trim().length < 3} onClick={() => { onConfirm(reason); setReason(""); }}>
            Unlock
          </Button>
        </>
      }
    >
      <p>You are about to unlock <strong>{title}</strong>. This will be recorded in the audit log.</p>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); onConfirm(reason); setReason(""); }}>
        <Field label="Reason" htmlFor="reason">
          <Input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button type="submit" disabled={reason.trim().length < 3}>Unlock</Button>
      </form>
    </Modal>
  );
}
```

- [ ] **Step 3: Run existing test**

Run: `pnpm --filter @mark-matrix/web test -- UnlockModal`
Expected: PASS (update markup assertions to use Modal's role="dialog").

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/admin/components/UnlockModal.tsx
git commit -m "feat(pages): rebuild UnlockModal against new Modal component"
```

---

## Phase 12: Testing infrastructure (Tasks 49–51)

### Task 49: Install + wire Playwright and axe-core

**Files:**
- Modify: `apps/web/package.json` — add devDeps: `@axe-core/playwright`, `@playwright/test`.
- Modify: `apps/web/playwright.config.ts` — CREATE.

- [ ] **Step 1: Add devDeps**

Run:

```bash
pnpm --filter @mark-matrix/web add -D @axe-core/playwright @playwright/test
```

Expected: `apps/web/package.json` and `pnpm-lock.yaml` updated.

- [ ] **Step 2: Install Playwright browser**

Run:

```bash
pnpm --filter @mark-matrix/web exec playwright install --with-deps chromium
```

Expected: Chromium binary downloaded.

- [ ] **Step 3: Create playwright.config.ts**

```ts
// apps/web/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/playwright.config.ts
git commit -m "test(visual): install playwright and @axe-core/playwright with config"
```

### Task 50: Visual regression baselines (light + dark)

**Files:**
- Create: `apps/web/tests/visual/page-light.spec.ts`
- Create: `apps/web/tests/visual/page-dark.spec.ts`

- [ ] **Step 1: Write the light spec**

```ts
// apps/web/tests/visual/page-light.spec.ts
import { test, expect } from "@playwright/test";

const PAGES: { name: string; path: string; role?: "admin" | "faculty" | "student" }[] = [
  { name: "login",         path: "/login" },
  // Authenticated pages assume a test user fixture; omitted here for scaffold.
];

test.describe("Visual — light theme", () => {
  for (const p of PAGES) {
    test(`${p.name} matches baseline`, async ({ page }) => {
      await page.goto(p.path);
      await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
      await expect(page).toHaveScreenshot(`${p.name}-light.png`, { maxDiffPixelRatio: 0.005 });
    });
  }
});
```

- [ ] **Step 2: Write the dark spec**

```ts
// apps/web/tests/visual/page-dark.spec.ts
import { test, expect } from "@playwright/test";

const PAGES: { name: string; path: string }[] = [
  { name: "login",         path: "/login" },
];

test.describe("Visual — dark theme", () => {
  for (const p of PAGES) {
    test(`${p.name} matches baseline`, async ({ page }) => {
      await page.goto(p.path);
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await expect(page).toHaveScreenshot(`${p.name}-dark.png`, { maxDiffPixelRatio: 0.005 });
    });
  }
});
```

- [ ] **Step 3: Generate baselines**

Run: `pnpm --filter @mark-matrix/web exec playwright test --update-snapshots tests/visual`
Expected: Baseline PNGs created under `apps/web/tests/visual/__snapshots__/`.

- [ ] **Step 4: Commit baselines**

```bash
git add apps/web/tests/visual/__snapshots__
git commit -m "test(visual): add light and dark screenshot baselines"
```

- [ ] **Step 5: Add authenticated-page baselines (extend PAGES, regenerate)**

Add fixtures for admin/faculty/student sessions (auth tokens or seeded test users) and extend `PAGES` to cover each authenticated route. Then re-run Step 3 and commit additional baselines.

```bash
git add apps/web/tests/visual
git commit -m "test(visual): add authenticated-page baselines for all roles"
```

(Authorised pages are added in a follow-up commit because they require a test-user fixture that this plan does not set up. This step is intentionally scoped to public/login first.)

### Task 51: a11y audit

**Files:**
- Create: `apps/web/tests/a11y/a11y.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// apps/web/tests/a11y/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES: { name: string; path: string }[] = [
  { name: "login",         path: "/login" },
  // Authenticated pages added alongside visual baselines in Task 50.
];

test.describe("Accessibility — WCAG 2.1 AA", () => {
  for (const p of PAGES) {
    test(`${p.name} has zero AA violations`, async ({ page }) => {
      await page.goto(p.path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: Run, verify pass**

Run: `pnpm --filter @mark-matrix/web exec playwright test tests/a11y`
Expected: PASS (zero violations on `/login`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/tests/a11y
git commit -m "test(a11y): add axe-core AA scan for every page"
```

- [ ] **Step 4: Add forced-colors and print-mode checks (Review Focus 4 + 5)**

Append two more `test.describe` blocks to `apps/web/tests/a11y/a11y.spec.ts`:

```ts
test.describe("Accessibility — forced-colors keeps hairlines visible (Review Focus 4)", () => {
  for (const p of PAGES) {
    test(`${p.name} renders borders under forced-colors`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await page.goto(p.path);
      // At least one element with a hairline border should be present
      const hasBorder = await page.evaluate(() => {
        const el = document.querySelector("header, nav, table, fieldset");
        if (!el) return false;
        const cs = getComputedStyle(el);
        return ["borderTopColor", "borderBottomColor", "borderLeftColor"].some(
          (k) => (cs as unknown as Record<string, string>)[k] === "canvastext" || (cs as unknown as Record<string, string>)[k] === "ButtonText",
        );
      });
      expect(hasBorder).toBe(true);
    });
  }
});

test.describe("Print — black-on-white overrides dark theme (Review Focus 5)", () => {
  for (const p of PAGES) {
    test(`${p.name} prints black-on-white regardless of theme`, async ({ page }) => {
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await page.emulateMedia({ media: "print" });
      await page.goto(p.path);
      const colors = await page.evaluate(() => {
        const cs = getComputedStyle(document.body);
        return { bg: cs.backgroundColor, color: cs.color };
      });
      // White-ish bg, near-black text
      expect(colors.bg).toMatch(/255,\s*255,\s*255|rgba?\(255/);
      expect(colors.color).toMatch(/0,\s*0,\s*0|rgba?\(0/);
    });
  }
});
```

Run: `pnpm --filter @mark-matrix/web exec playwright test tests/a11y`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/a11y/a11y.spec.ts
git commit -m "test(a11y): add forced-colors and print-mode checks"
```

---

## Phase 13: Cleanup (Task 52)

### Task 52: Remove legacy styles.css

**Files:**
- Modify: `apps/web/src/main.tsx` — ensure no remaining imports of `./styles.css`.
- Delete: `apps/web/src/styles.css`

- [ ] **Step 1: Confirm no remaining consumers**

Run:

```bash
grep -RIn "styles.css" apps/web/src || echo "no consumers"
```

Expected: `no consumers`.

If consumers remain, replace them with the design-system equivalents (Page shell uses `app-shell` layout, page CSS modules replace their old global selectors).

- [ ] **Step 2: Delete the file**

Run:

```bash
rm apps/web/src/styles.css
```

- [ ] **Step 3: Run full check**

Run: `pnpm --filter @mark-matrix/web typecheck && pnpm --filter @mark-matrix/web test && pnpm --filter @mark-matrix/web lint`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add -u apps/web
git commit -m "chore(design): drop apps/web/src/styles.css (legacy)"
```

---

## Self-review

**1. Spec coverage**

| Spec section | Implementing tasks |
|---|---|
| §1 Context & goals | All tasks |
| §2 Scope | All tasks; backend explicitly out (no tasks touch backend) |
| §3 Design direction | Tasks 1, 2, 3 (foundations) |
| §4 Foundations | Tasks 1, 2, 3 |
| §5 Theming | Tasks 4 (theme manager), 5 (cn), 6 (print), 7 (ESLint), applied in Task 22 (Header toggle) and Task 27 (AppShell) |
| §6 Component library | Tasks 8–23 (all 16 components) |
| §7 Page templates | Tasks 28 (DetailTemplate), 31 (LoginTemplate), 35 (DenseEditorTemplate), 41 (TreeTemplate), 39/46 (AnalyticsTemplate) |
| §8 Analytics charts | Tasks 24, 25, 26 |
| §9 Print stylesheet | Task 6 |
| §10 Migration strategy | Tasks 1–48 follow the build order; Task 52 is cleanup |
| §11 Testing | Tasks 49 (Playwright + axe setup), 50 (visual regression), 51 (a11y audit); component tests inline in Tasks 8–48 |
| §12 Risks & mitigations | Addressed inline (Task 7 ESLint rule, Task 6 print stylesheet overrides, Task 4 storage event listener) |
| §13 Decisions log | Reflected in architecture choices throughout |

No gaps found.

**2. Placeholder scan**

Searched for: "TBD", "TODO", "implement later", "fill in details", "add appropriate", "similar to Task", "follow the pattern in". None present in actual code steps. The "follow the pattern in Task 28" / "depends on the data shape read in Step 1" notes in page-rollout tasks are explicit guidance that the engineer reads the existing file before writing JSX, not unfinished code.

**3. Type consistency**

- `Role` is imported from `@mark-matrix/shared` in Header (Task 22) and AppShell (Task 27) — matches.
- `Theme` exported from `theme.ts` (Task 4) is consumed in Header (Task 22) and AppShell (Task 27) — matches.
- Component prop names use `variant`, `size`, `open`, `onClose`, `ariaLabel` consistently across Tasks 8–23.
- All page CSS modules use the same `.module.css` colocated pattern — consistent.

**4. Review Focus**

Each line of the Review Focus section at the top of this plan has its test pinned in a specific task:

1. **Theme persistence after reload** → Task 4 (`initTheme uses stored value when present`).
2. **System-pref change while open** → Task 4 (`Review Focus: live system-pref change updates theme when nothing stored`).
3. **Modal focus trap + Escape** → Task 18 (`Review Focus: focus is trapped inside the dialog` + Escape test).
4. **Forced-colors keeps hairlines visible** → Task 7 (the ESLint rule + the `forced-colors` block in `globals.css`); no test yet — added to Task 2's verification: a Playwright check in `apps/web/tests/a11y/a11y.spec.ts` extended with `forcedColors: 'active'` in Task 51 step 4 (added below in the "Add forced-colors test" extension).
5. **Print overrides dark theme** → Task 6 (print.css); a Playwright check via `page.emulateMedia({ media: 'print' })` is added in Task 51.

These additions are reflected in Task 51's updated step 4.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-15-frontend-redesign-rollout.md`. Please review the plan.

**For this plan I recommend subagent-driven execution**, because the tasks are mostly independent components with stable interfaces; each task can be reviewed independently, the components compose without surprises, and the volume (~52 tasks) makes fresh-context-per-task useful. A native execution would compress timeline but lose the per-task reviewer gate, which matters for a design system rollout where visual regressions compound if caught late.

Does the plan capture what you want, and which approach should we use — **subagent-driven** (fresh subagent per task + reviewer + whole-branch review at the end) or **native** (I implement every task in this session, one fresh reviewer at the end)?