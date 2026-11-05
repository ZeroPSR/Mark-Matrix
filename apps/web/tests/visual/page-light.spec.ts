// apps/web/tests/visual/page-light.spec.ts
import { test, expect } from "@playwright/test";
import { gotoSpa, setTheme, waitForFonts, type SpaPage } from "../helpers/spa.js";

const PAGES: SpaPage[] = [
  { name: "login", path: "/login", expectHeading: "Mark-Matrix" },
  // Authenticated pages assume a test user fixture; omitted here for scaffold.
];

test.describe("Visual — light theme", () => {
  for (const p of PAGES) {
    test(`${p.name} matches baseline`, async ({ page }) => {
      await gotoSpa(page, p);
      await setTheme(page, "light");
      await waitForFonts(page);
      await expect(page).toHaveScreenshot(`${p.name}-light.png`, { maxDiffPixelRatio: 0.005 });
    });
  }
});
