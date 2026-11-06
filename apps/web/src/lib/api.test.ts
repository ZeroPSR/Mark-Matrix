// apps/web/src/lib/api.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import type * as ApiModule from "./api.js";

// The API module creates a Supabase client on import, and happy-dom has no
// WebSocket for the realtime client to open.
vi.mock("./supabase.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}));

/**
 * Loads a fresh copy of the module: the API origin is read once, at module
 * load, so the env has to be stubbed before the import.
 */
async function loadApi(): Promise<typeof ApiModule> {
  vi.resetModules();
  return import("./api.js");
}

describe("apiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("prefixes the configured API origin", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "https://api.mark-matrix.test");
    const { apiUrl } = await loadApi();
    expect(apiUrl("/api/admin/audit-log")).toBe(
      "https://api.mark-matrix.test/api/admin/audit-log",
    );
  });

  it("falls back to a relative path when no origin is configured", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "");
    const { apiUrl } = await loadApi();
    expect(apiUrl("/api/admin/audit-log")).toBe("/api/admin/audit-log");
  });
});
