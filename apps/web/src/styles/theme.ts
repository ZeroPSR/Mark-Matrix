export type Theme = "light" | "dark";
const STORAGE_KEY = "mark-matrix:theme";

export function getStoredTheme(): Theme | null {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : null;
}

export function setStoredTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme);
}

export function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

let systemListenerAttached = false;

export function initTheme(): void {
  const stored = getStoredTheme();
  if (stored !== null) {
    applyTheme(stored);
  } else {
    applyTheme(getSystemTheme());
    if (!systemListenerAttached) {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = (): void => {
        if (getStoredTheme() === null) applyTheme(getSystemTheme());
      };
      if (mql.addEventListener) {
        mql.addEventListener("change", handler);
      } else if (mql.addListener) {
        mql.addListener(handler);
      }
      systemListenerAttached = true;
    }
  }
}

export function toggleTheme(): void {
  const current = getStoredTheme() ?? getSystemTheme();
  const next: Theme = current === "dark" ? "light" : "dark";
  setStoredTheme(next);
  applyTheme(next);
}