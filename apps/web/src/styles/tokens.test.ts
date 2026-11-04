import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { breakpoints, colors, motion, radius, space, type } from "./tokens.js";

/**
 * The CSS source of truth, read from disk — Vitest stubs CSS imports, so
 * `?raw` returns an empty string.
 */
const tokensCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "tokens.css"),
  "utf8",
);

/**
 * Every custom property declared in `tokens.css`, keyed by its name without the
 * leading `--`. The first declaration wins: later blocks (dark theme, reduced
 * motion) only override values, they never introduce new names.
 */
function readCssVariables(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const match of css.matchAll(/--([A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) continue;
    if (!vars.has(name)) vars.set(name, value.trim());
  }
  return vars;
}

const cssVars = readCssVariables(tokensCss);

/** The mirror groups whose values are `var(--…)` strings. */
const mirrorGroups: ReadonlyArray<Readonly<Record<string, string>>> = [
  colors,
  type,
  space,
  radius,
  motion,
];

/** Every custom property the mirror points at, e.g. `color-ink`, `type-body`. */
function referencedVariables(): Set<string> {
  const refs = new Set<string>();
  for (const group of mirrorGroups) {
    for (const [key, value] of Object.entries(group)) {
      const match = /^var\(--([A-Za-z0-9_-]+)\)$/.exec(value);
      if (match && match[1] !== undefined) {
        refs.add(match[1]);
      } else {
        throw new Error(`mirror entry "${key}" is not a var(--…) string: ${value}`);
      }
    }
  }
  return refs;
}

describe("tokens.ts mirrors tokens.css", () => {
  it("exposes every token group with the expected entry count", () => {
    // 11 colours + 7 type-scale + 9 spacing + 2 radius + 1 motion + 3 breakpoints.
    expect(Object.values(colors)).toHaveLength(11);
    expect(Object.values(type)).toHaveLength(7);
    expect(Object.values(space)).toHaveLength(9);
    expect(Object.values(radius)).toHaveLength(2);
    expect(Object.values(motion)).toHaveLength(1);
    expect(Object.values(breakpoints)).toHaveLength(3);
  });

  it("mirrors the type scale", () => {
    expect(type).toEqual({
      display: "var(--type-display)",
      h1: "var(--type-h1)",
      h2: "var(--type-h2)",
      h3: "var(--type-h3)",
      body: "var(--type-body)",
      small: "var(--type-small)",
      mono: "var(--type-mono)",
    });
  });

  it("references only custom properties that tokens.css declares", () => {
    for (const name of referencedVariables()) {
      expect(cssVars.has(name), `--${name} is missing from tokens.css`).toBe(true);
    }
  });

  it("mirrors exactly the custom properties tokens.css declares", () => {
    const refs = referencedVariables();
    const declared = [...cssVars.keys()]
      // Breakpoints are mirrored as numbers, not as var() strings — see below.
      .filter((name) => !name.startsWith("bp-"))
      .sort();
    expect([...refs].sort()).toEqual(declared);
  });

  it("covers exactly the breakpoint names tokens.css declares", () => {
    const declared = [...cssVars.keys()]
      .filter((name) => name.startsWith("bp-"))
      .map((name) => name.replace(/^bp-/, ""))
      .sort();
    expect(Object.keys(breakpoints).sort()).toEqual(declared);
  });

  it("mirrors the breakpoint pixel values", () => {
    for (const [key, value] of Object.entries(breakpoints)) {
      expect(cssVars.get(`bp-${key}`)).toBe(`${value}px`);
    }
  });
});
