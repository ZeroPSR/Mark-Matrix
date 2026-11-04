// apps/web/tests/helpers/spa.ts
// Shared helpers for the Playwright suites under `apps/web/tests/`.
import { expect, type Page } from "@playwright/test";

/**
 * Navigates to an SPA route.
 *
 * `pnpm dev` runs Vite with the Cloudflare Pages plugin, whose dev server
 * serves static assets without an SPA fallback — a deep link such as
 * `/login` is a hard 404 with an empty body. The SPA shell is therefore
 * loaded at the root and the route is reached through the client-side
 * router (React Router listens for `popstate`).
 */
export async function gotoSpa(page: Page, path: string): Promise<void> {
  await page.goto("/");
  // Wait for React to mount so the router is listening for `popstate`.
  await page.waitForSelector("#root > *");
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  // The route has rendered once its heading is on screen.
  await expect(page.locator("h1")).toBeVisible();
}

/** The web fonts the app loads from Google Fonts at runtime. */
const WEB_FONTS: string[] = ["IBM Plex Sans", "IBM Plex Mono", "Source Serif 4"];

/**
 * Waits for the runtime-loaded web fonts to be ready.
 *
 * `src/styles/fonts.css` pulls the families from Google Fonts at runtime,
 * so a screenshot taken before they land compares against fallback metrics.
 * The fonts are also asserted to be present, so an offline run fails loudly
 * instead of silently capturing a fallback rendering.
 */
export async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async (families: string[]) => {
    await document.fonts.ready;
    await Promise.all(families.map((family) => document.fonts.load(`16px "${family}"`)));
    await document.fonts.ready;
  }, WEB_FONTS);
  const loaded = await page.evaluate(
    (families: string[]) =>
      Object.fromEntries(
        families.map((family) => [family, document.fonts.check(`16px "${family}"`)]),
      ),
    WEB_FONTS,
  );
  expect(
    loaded,
    "web fonts did not load — screenshots would be compared against fallback metrics",
  ).toEqual(Object.fromEntries(WEB_FONTS.map((family) => [family, true])));
}
