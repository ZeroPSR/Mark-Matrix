import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The global stylesheet, read from disk — Vitest stubs CSS imports, so
 * `?raw` returns an empty string.
 */
const globalsCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "globals.css"),
  "utf8",
);

/**
 * The `color-scheme` declared for a selector, or null when the selector
 * declares none.
 */
function colorSchemeFor(selector: string): string | null {
  const block = new RegExp(
    `(^|[},])\\s*${selector.replace(/[[\]]/g, "\\$&")}\\s*\\{([^}]*)\\}`,
    "m",
  ).exec(globalsCss);
  const body = block?.[2];
  if (body === undefined) return null;
  const match = /color-scheme\s*:\s*([a-zA-Z]+)\s*;/.exec(body);
  return match?.[1] ?? null;
}

describe("global stylesheet", () => {
  it("tells the browser which colour scheme each theme uses", () => {
    // Native widgets are drawn by the browser, outside the page. Without
    // this, a select's open dropdown is drawn light in the dark theme — the
    // page's own colours never reach it.
    expect(colorSchemeFor(":root")).toBe("light");
    expect(colorSchemeFor(':root[data-theme="dark"]')).toBe("dark");
  });
});
