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

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("keeps the body when the response is not JSON", async () => {
    // A plain-text answer — Hono's default "Internal Server Error", a proxy's
    // HTML error page — used to arrive as the bare code "parse_failed", with
    // the reason discarded.
    vi.stubEnv("VITE_API_ORIGIN", "https://api.mark-matrix.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      }),
    );

    const { apiFetch } = await loadApi();
    await expect(apiFetch("/api/admin/batches")).rejects.toMatchObject({
      status: 500,
      body: { error: "parse_failed", detail: "Internal Server Error" },
    });
  });

  it("parses a JSON body as before", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "https://api.mark-matrix.test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(JSON.stringify({ data: [1, 2] })),
      }),
    );

    const { apiFetch } = await loadApi();
    await expect(apiFetch("/api/admin/batches")).resolves.toEqual({ data: [1, 2] });
  });
});
