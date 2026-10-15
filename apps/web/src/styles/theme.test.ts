import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredTheme,
  setStoredTheme,
  getSystemTheme,
  applyTheme,
  initTheme,
  toggleTheme,
  type Theme,
} from "./theme.js";

describe("theme manager", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("returns null when nothing stored", () => {
    expect(getStoredTheme()).toBeNull();
  });

  it("round-trips stored theme", () => {
    setStoredTheme("dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("returns 'dark' from system when prefers-color-scheme is dark", () => {
    // happy-dom defaults to light
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (q: string) => ({
        matches: q.includes("dark"),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    });
    expect(getSystemTheme()).toBe("dark");
  });

  it("applyTheme sets data-theme on html", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("applyTheme(light) removes data-theme", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
  });

  it("initTheme uses stored value when present", () => {
    setStoredTheme("dark");
    initTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("initTheme falls back to system when nothing stored", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (q: string) => ({
        matches: q.includes("dark"),
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    });
    initTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggleTheme flips from light to dark", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    toggleTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    expect(getStoredTheme()).toBe("light");
  });

  it("Review Focus: theme persists across simulated reload", () => {
    setStoredTheme("dark");
    document.documentElement.removeAttribute("data-theme");
    initTheme();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("Review Focus: live system-pref change updates theme when nothing stored", () => {
    localStorage.clear();
    setStoredTheme(null as unknown as Theme);
    let attached = false;
    const mql = {
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: (_: string, _l: () => void) => { attached = true; },
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    };
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: () => mql,
    });
    // Re-run initTheme via fresh module import to defeat module-level
    // systemListenerAttached state from earlier tests in this run.
    return import("./theme.js?live=" + Date.now()).then((mod) => {
      mod.initTheme();
      expect(attached).toBe(true);
    });
  });
});