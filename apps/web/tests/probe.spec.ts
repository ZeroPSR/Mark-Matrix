import { test } from "@playwright/test";

async function open(page: import("@playwright/test").Page, path: string): Promise<void> {
  await page.goto("/");
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
  await page.waitForTimeout(800);
}

test("probe forced-colors", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "/login");
  const info = await page.evaluate(() => {
    const el = document.querySelector("form");
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    return {
      found: true,
      tag: el.tagName,
      borderTopColor: cs.borderTopColor,
      borderBottomColor: cs.borderBottomColor,
      borderLeftColor: cs.borderLeftColor,
      borderTopWidth: cs.borderTopWidth,
      borderTopStyle: cs.borderTopStyle,
      bodyColor: getComputedStyle(document.body).color,
      hairline: getComputedStyle(document.documentElement).getPropertyValue("--color-hairline"),
    };
  });
  console.log(`[forced] ${JSON.stringify(info, null, 2)}`);
});

test("probe print+dark", async ({ page }) => {
  await page.emulateMedia({ media: "print", colorScheme: "dark" });
  await open(page, "/login");
  const info = await page.evaluate(() => {
    const cs = getComputedStyle(document.body);
    return {
      theme: document.documentElement.getAttribute("data-theme"),
      bg: cs.backgroundColor,
      color: cs.color,
    };
  });
  console.log(`[print] ${JSON.stringify(info, null, 2)}`);
});
