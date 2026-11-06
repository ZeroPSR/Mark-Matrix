import { describe, it, expect } from "vitest";
import app from "../index.js";

// CORS: the web app runs on a different origin from the API, so every API
// call is preflighted. The preflight's `Access-Control-Allow-Origin` decides
// whether the browser hands the real response to the page or discards it —
// and a discarded response surfaces in the UI as "Failed to fetch", with no
// indication that the API was never reached.
//
// Two things are pinned here. The local dev origins must be allowed: the Vite
// dev server serves on `localhost`, and the API's allowlist covers the
// deployed web origins plus loopback. And a hostname that merely *starts
// with* `127.0.0.1` must not be — `http://127.0.0.1.evil.test` is a hostname
// its owner can point at their own server, and a page served from it would
// otherwise be able to read API responses.

const env = {
  ENVIRONMENT: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-svc",
};

async function allowOriginFor(origin: string): Promise<string | null> {
  const res = await app.request(
    "/api/admin/users",
    {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    },
    env,
  );
  return res.headers.get("access-control-allow-origin");
}

describe("CORS", () => {
  it("allows the deployed web origins", async () => {
    expect(await allowOriginFor("https://mark-matrix-web.pages.dev")).toBe(
      "https://mark-matrix-web.pages.dev",
    );
    expect(
      await allowOriginFor("https://mark-matrix-web.team-tractor.workers.dev"),
    ).toBe("https://mark-matrix-web.team-tractor.workers.dev");
  });

  it("allows both loopback names, on any port", async () => {
    expect(await allowOriginFor("http://localhost:5173")).toBe("http://localhost:5173");
    expect(await allowOriginFor("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
    expect(await allowOriginFor("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
  });

  it("does not allow a hostname that merely starts with 127.0.0.1", async () => {
    expect(await allowOriginFor("http://127.0.0.1.evil.test")).toBe(
      "https://mark-matrix-web.pages.dev",
    );
  });

  it("does not allow a non-http scheme on a loopback name", async () => {
    expect(await allowOriginFor("file://localhost")).toBe(
      "https://mark-matrix-web.pages.dev",
    );
  });

  it("falls back to the production origin for an unknown origin", async () => {
    expect(await allowOriginFor("https://evil.test")).toBe(
      "https://mark-matrix-web.pages.dev",
    );
  });
});
