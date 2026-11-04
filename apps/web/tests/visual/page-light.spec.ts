// apps/web/tests/visual/page-light.spec.ts
import { test, expect } from "@playwright/test";
import { gotoSpa, waitForFonts } from "../helpers/spa.js";

const PAGES: { name: string; path: string; role?: "admin" | "faculty" | "student" }[] = [
  { name: "login", path: "/login" },
  // Authenticated pages assume a test user fixture; omitted here for scaffold.
];

test.describe("Visual — light theme", () => {
  for (const p of PAGES) {
    test(`${p.name} matches baseline`, async ({ page }) => {
      await gotoSpa(page, p.path);
      await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
      await waitForFonts(page);
      await expect(page).toHaveScreenshot(`${p.name}-light.png`, { maxDiffPixelRatio: 0.005 });
    });
  }
});
