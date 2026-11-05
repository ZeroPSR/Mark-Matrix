// apps/web/tests/helpers/spa.ts
// Shared helpers for the Playwright suites under `apps/web/tests/`.
import { expect, type Page } from "@playwright/test";

/** A route under audit, plus the evidence that it actually rendered. */
export interface SpaPage {
  name: string;
  path: string;
  /**
   * The heading this route renders.
   *
   * Required, because a generic "some `<h1>` is visible" check is satisfied
   * by the catch-all `NotFoundPage` and `ForbiddenPage` as well — an audit
   * that silently fell through to the 404 page would still report green.
   */
  expectHeading: string;
  role?: "admin" | "faculty" | "student";
}

/** The theme an audit or a screenshot is rendered in. */
export type Theme = "light" | "dark";

/**
 * Navigates to an SPA route and proves that route — not the catch-all 404 —
 * is on screen.
 *
 * `pnpm dev` runs Vite with the Cloudflare Pages plugin, whose dev server
 * serves static assets without an SPA fallback — a deep link such as
 * `/login` is a hard 404 with an empty body. The SPA shell is therefore
 * loaded at the root and the route is reached through the client-side
 * router (React Router listens for `popstate`).
 */
export async function gotoSpa(page: Page, target: SpaPage): Promise<void> {
  await page.goto("/");
  // Wait for React to mount so the router is listening for `popstate`.
  await page.waitForSelector("#root > *");
  await page.evaluate((p) => {
    // React Router keeps `{usr, key, idx}` in the history state and derives
    // the next index from it, so the existing state is preserved rather than
    // replaced with `{}`.
    window.history.pushState({ ...window.history.state }, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, target.path);
  await expect(
    page.getByRole("heading", { level: 1, name: target.expectHeading }),
  ).toBeVisible();
}

/**
 * Applies a theme to the already-rendered page.
 *
 * `initTheme()` picks the theme from `prefers-color-scheme` on boot; the
 * attribute is set explicitly afterwards so the result does not depend on the
 * host's system preference.
 */
export async function setTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((t) => {
    if (t === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, theme);
}

/** The web fonts the app loads from Google Fonts at runtime, with the
 *  weights `src/styles/fonts.css` actually declares. */
const WEB_FONTS: { family: string; weight: string }[] = [
  { family: "IBM Plex Sans", weight: "400" },
  { family: "IBM Plex Sans", weight: "600" },
  { family: "IBM Plex Mono", weight: "400" },
  { family: "Source Serif 4", weight: "600" },
];

/**
 * Waits for the runtime-loaded web fonts to be ready.
 *
 * `src/styles/fonts.css` pulls the families from Google Fonts at runtime,
 * so a screenshot taken before they land compares against fallback metrics.
 * Each family is loaded at the weight the stylesheet declares — a `check()`
 * for a weight that was never declared returns `true` by spec — and the load
 * must return at least one matching face, so an offline run fails loudly
 * instead of silently capturing a fallback rendering.
 */
export async function waitForFonts(page: Page): Promise<void> {
  const loaded = await page.evaluate(async (fonts) => {
    await document.fonts.ready;
    const result: Record<string, boolean> = {};
    for (const font of fonts) {
      const shorthand = `${font.weight} 16px "${font.family}"`;
      const faces = await document.fonts.load(shorthand);
      result[`${font.weight} ${font.family}`] =
        faces.length > 0 && document.fonts.check(shorthand);
    }
    await document.fonts.ready;
    return result;
  }, WEB_FONTS);
  expect(
    loaded,
    "web fonts did not load — screenshots would be compared against fallback metrics",
  ).toEqual(
    Object.fromEntries(WEB_FONTS.map((f) => [`${f.weight} ${f.family}`, true])),
  );
}
