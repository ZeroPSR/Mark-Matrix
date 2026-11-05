// apps/web/tests/a11y/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { gotoSpa, setTheme, type SpaPage, type Theme } from "../helpers/spa.js";

const PAGES: SpaPage[] = [
  { name: "login", path: "/login", expectHeading: "Mark-Matrix" },
  // Authenticated pages need a test-user fixture, which this plan does not
  // set up; they are added to this list once one exists.
];

/** The themes the app ships. The dark theme has its own tokens, so it is
 *  audited as well as the light one. */
const THEMES: Theme[] = ["light", "dark"];

test.describe("Accessibility — WCAG 2.1 AA", () => {
  for (const theme of THEMES) {
    for (const p of PAGES) {
      test(`${p.name} has zero AA violations (${theme} theme)`, async ({ page }) => {
        await gotoSpa(page, p);
        await setTheme(page, theme);
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
      });
    }
  }
});

test.describe("Accessibility — forced-colors keeps hairlines visible (Review Focus 4)", () => {
  for (const p of PAGES) {
    test(`${p.name} renders borders under forced-colors`, async ({ page }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await gotoSpa(page, p);
      const forced = await page.evaluate(() => {
        // Chromium replaces the *used value* of every border colour with the
        // system palette, so the computed border colour is `rgb(0, 0, 0)`
        // whatever the stylesheet declares. Custom properties are not
        // colour-adjusted, so the declaration the `@media (forced-colors:
        // active)` block actually controls is read from the root element.
        const hairline = getComputedStyle(document.documentElement)
          .getPropertyValue("--color-hairline")
          .trim();

        // At least one element must still render a visible border — forced
        // colours must not erase the hairline.
        let hasVisibleBorder = false;
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
          const cs = getComputedStyle(el);
          const sides = [
            { style: cs.borderTopStyle, width: cs.borderTopWidth },
            { style: cs.borderBottomStyle, width: cs.borderBottomWidth },
            { style: cs.borderLeftStyle, width: cs.borderLeftWidth },
            { style: cs.borderRightStyle, width: cs.borderRightWidth },
          ];
          if (sides.some((s) => s.style !== "none" && parseFloat(s.width) > 0)) {
            hasVisibleBorder = true;
            break;
          }
        }
        return { hairline, hasVisibleBorder };
      });
      expect(
        forced.hairline,
        "forced-colors must remap --color-hairline to the system text colour",
      ).toBe("CanvasText");
      expect(
        forced.hasVisibleBorder,
        "no element rendered a visible border under forced-colors",
      ).toBe(true);
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
      await gotoSpa(page, p);
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
