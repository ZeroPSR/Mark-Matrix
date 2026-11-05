// apps/web/src/components/Badge/Badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Badge } from "./Badge.js";

/**
 * A variant class is only as real as the rule behind it, so the stylesheet
 * is read from disk and each variant's rule is checked for.
 *
 * The path is resolved from the working directory rather than from
 * import.meta.url: under the happy-dom environment import.meta.url is not a
 * file:// URL, so fileURLToPath() would throw.
 */
function readStylesheet(): string {
  let dir = process.cwd();
  for (;;) {
    const candidate = resolve(dir, "src/components/Badge/Badge.module.css");
    if (existsSync(candidate)) return readFileSync(candidate, "utf8");
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Badge.module.css not found above ${process.cwd()}`);
    }
    dir = parent;
  }
}

const css = readStylesheet();

/** The scoped class the component put on the element. */
function classNames(text: string): string[] {
  return (screen.getByText(text).className ?? "").split(/\s+/).filter(Boolean);
}

describe("Badge", () => {
  it("renders uppercase text with the variant class", () => {
    render(<Badge variant="draft">Draft</Badge>);
    const el = screen.getByText("Draft");
    expect(el.className).toMatch(/draft/);
    // styles apply text-transform: uppercase via CSS; trust the class
  });

  it.each([
    ["approved", "Approved"],
    ["compiled", "Compiled"],
    ["neutral", "Neutral"],
  ] as const)("applies the %s variant class", (variant, label) => {
    render(<Badge variant={variant}>{label}</Badge>);
    const classes = classNames(label);
    expect(classes.some((c) => c.includes(variant))).toBe(true);
    // The variant class is in addition to the shared base class.
    expect(classes.some((c) => c.includes("badge"))).toBe(true);
  });

  it("gives each variant its own class", () => {
    const seen = new Map<string, string[]>();
    for (const [variant, label] of [
      ["approved", "Approved"],
      ["compiled", "Compiled"],
      ["neutral", "Neutral"],
      ["draft", "Draft"],
    ] as const) {
      const { unmount } = render(<Badge variant={variant}>{label}</Badge>);
      seen.set(variant, classNames(label));
      unmount();
    }
    const all = [...seen.values()].flat();
    for (const [variant, classes] of seen) {
      const others = [...seen.entries()].filter(([v]) => v !== variant).flatMap(([, c]) => c);
      expect(classes.some((c) => others.includes(c) && !c.includes("badge"))).toBe(false);
    }
    // Every variant carries its own class, not just the shared base one.
    for (const [variant, classes] of seen) {
      expect(classes.some((c) => c.includes(variant))).toBe(true);
    }
    expect(all.length).toBeGreaterThan(0);
  });

  it.each(["approved", "compiled", "neutral"])(
    "defines a %s rule in the stylesheet",
    (variant) => {
      expect(css).toMatch(new RegExp(`\\.${variant}\\s*\\{`));
    },
  );

  it("uses only design tokens for the new variants", () => {
    for (const variant of ["approved", "compiled", "neutral"]) {
      const rule = css.match(new RegExp(`\\.${variant}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
      expect(rule).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(rule).toMatch(/var\(--/);
    }
  });

  it("leaves the pre-existing variants untouched", () => {
    for (const variant of ["draft", "submitted", "published", "locked", "error"]) {
      expect(css).toMatch(new RegExp(`\\.${variant}\\s*\\{`));
    }
  });
});
