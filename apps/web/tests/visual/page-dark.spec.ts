// apps/web/tests/visual/page-dark.spec.ts
import { test, expect } from "@playwright/test";
import { gotoSpa, setTheme, waitForFonts, type SpaPage } from "../helpers/spa.js";

const PAGES: SpaPage[] = [
  { name: "login", path: "/login", expectHeading: "Mark-Matrix" },
];

test.describe("Visual — dark theme", () => {
  for (const p of PAGES) {
    test(`${p.name} matches baseline`, async ({ page }) => {
      await gotoSpa(page, p);
      await setTheme(page, "dark");
      await waitForFonts(page);
      await expect(page).toHaveScreenshot(`${p.name}-dark.png`, { maxDiffPixelRatio: 0.005 });
    });
  }
});
