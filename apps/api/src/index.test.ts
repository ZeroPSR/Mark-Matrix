import { describe, it, expect } from "vitest";
import app from "./index.js";

describe("GET /health", () => {
  it("returns status ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; timestamp: string };
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
  });
});
