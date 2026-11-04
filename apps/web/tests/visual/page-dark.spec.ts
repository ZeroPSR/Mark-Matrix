// apps/web/tests/visual/page-dark.spec.ts
import { test, expect } from "@playwright/test";
import { gotoSpa, waitForFonts } from "../helpers/spa.js";

const PAGES: { name: string; path: string }[] = [
  { name: "login", path: "/login" },
];

test.describe("Visual — dark theme", () => {
  for (const p of PAGES) {
    test(`${p.name} matches baseline`, async ({ page }) => {
      await gotoSpa(page, p.path);
      await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
      await waitForFonts(page);
      await expect(page).toHaveScreenshot(`${p.name}-dark.png`, { maxDiffPixelRatio: 0.005 });
    });
  }
});
