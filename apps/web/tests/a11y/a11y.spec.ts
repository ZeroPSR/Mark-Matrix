// apps/web/tests/a11y/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES: { name: string; path: string }[] = [
  { name: "login", path: "/login" },
  // Authenticated pages added alongside visual baselines in Task 50.
];

test.describe("Accessibility — WCAG 2.1 AA", () => {
  for (const p of PAGES) {
    test(`${p.name} has zero AA violations`, async ({ page }) => {
      await page.goto(p.path);
      // Guard against a vacuous pass: if the SPA never rendered, axe would
      // scan an empty document and report zero violations.
      await expect(page.locator("h1")).toBeVisible();
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }
});

test.describe("Accessibility — forced-colors keeps hairlines visible (Review Focus 4)", () => {
  for (const p of PAGES) {
    test(`${p.name} renders borders under forced-colors`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await page.goto(p.path);
      // At least one element with a hairline border should be present.
      // The login page renders no header/nav/table/fieldset, so the login
      // card (`<form>`, which carries the `--color-hairline` border) is
      // included in the selector.
      const hasBorder = await page.evaluate(() => {
        const el = document.querySelector("header, nav, table, fieldset, form");
        if (!el) return false;
        const cs = getComputedStyle(el);
        return ["borderTopColor", "borderBottomColor", "borderLeftColor"].some(
          (k) =>
            (cs as unknown as Record<string, string>)[k] === "canvastext" ||
            (cs as unknown as Record<string, string>)[k] === "ButtonText",
        );
      });
      expect(hasBorder).toBe(true);
    });
  }
});

test.describe("Print — black-on-white overrides dark theme (Review Focus 5)", () => {
  for (const p of PAGES) {
    test(`${p.name} prints black-on-white regardless of theme`, async ({ page }) => {
      // The dark theme is selected by `initTheme()` from
      // `prefers-color-scheme`, so the colour scheme is emulated rather than
      // the `data-theme` attribute set directly (an attribute written before
      // `goto()` is discarded by the navigation).
      await page.emulateMedia({ media: "print", colorScheme: "dark" });
      await page.goto(p.path);
      // Guard against a vacuous pass: the print overrides are only meaningful
      // if the page really is rendering in the dark theme.
      const theme = await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme"),
      );
      expect(theme, "page must render in the dark theme for this check to mean anything").toBe(
        "dark",
      );
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
