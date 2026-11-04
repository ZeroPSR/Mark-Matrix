// apps/web/tests/a11y/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { gotoSpa } from "../helpers/spa.js";

const PAGES: { name: string; path: string }[] = [
  { name: "login", path: "/login" },
  // Authenticated pages need a test-user fixture, which this plan does not
  // set up; they are added to this list once one exists.
];

test.describe("Accessibility — WCAG 2.1 AA", () => {
  for (const p of PAGES) {
    test(`${p.name} has zero AA violations`, async ({ page }) => {
      await gotoSpa(page, p.path);
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
      await gotoSpa(page, p.path);
      // At least one element with a hairline border should be present, and
      // that border should follow the system text colour.
      //
      // Two changes from the original brief:
      //  * The original selector (`header, nav, table, fieldset`) matches
      //    nothing on the login page — it renders a `<form>` card with the
      //    hairline border — so every element is considered instead.
      //  * Chromium resolves the `canvastext` system colour to its RGB value
      //    in `getComputedStyle` (`rgb(0, 0, 0)`), so the border colour is
      //    compared against the computed system text colour as well as the
      //    `canvastext` / `ButtonText` keywords.
      const hasBorder = await page.evaluate(() => {
        const systemText = getComputedStyle(document.body).color;
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
          const cs = getComputedStyle(el);
          const sides = [
            { style: cs.borderTopStyle, width: cs.borderTopWidth, color: cs.borderTopColor },
            { style: cs.borderBottomStyle, width: cs.borderBottomWidth, color: cs.borderBottomColor },
            { style: cs.borderLeftStyle, width: cs.borderLeftWidth, color: cs.borderLeftColor },
            { style: cs.borderRightStyle, width: cs.borderRightWidth, color: cs.borderRightColor },
          ];
          const visible = sides.filter((s) => s.style !== "none" && parseFloat(s.width) > 0);
          if (visible.length === 0) continue;
          const usesSystemText = visible.some(
            (s) =>
              s.color === "canvastext" ||
              s.color === "ButtonText" ||
              s.color === systemText,
          );
          if (usesSystemText) return true;
        }
        return false;
      });
      expect(hasBorder).toBe(true);
    });
  }
});

test.describe("Print — black-on-white overrides dark theme (Review Focus 5)", () => {
  for (const p of PAGES) {
    test(`${p.name} prints black-on-white regardless of theme`, async ({ page }) => {
      // The theme is chosen by `initTheme()` from `prefers-color-scheme`, so
      // the colour scheme is emulated instead of setting `data-theme`
      // directly — an attribute written before `goto()` is discarded by the
      // navigation.
      await page.emulateMedia({ media: "print", colorScheme: "dark" });
      await gotoSpa(page, p.path);
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
