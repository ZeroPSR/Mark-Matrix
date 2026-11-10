import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type * as UseResourceModule from "./useResource.js";

const mockApiFetch = vi.fn();

vi.mock("./api.js", () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

async function loadUseResource(): Promise<typeof UseResourceModule> {
  vi.resetModules();
  return import("./useResource.js");
}

/** The shape apiFetch throws: an Error carrying the parsed response body. */
function apiError(body: { error: string; detail?: string }): Error & {
  status: number;
  body: { error: string; detail?: string };
} {
  const err = new Error("API 500") as Error & {
    status: number;
    body: { error: string; detail?: string };
  };
  err.status = 500;
  err.body = body;
  return err;
}

describe("useResource", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("reports the error code the server sent", async () => {
    mockApiFetch.mockRejectedValue(apiError({ error: "not_found" }));
    const { useResource } = await loadUseResource();
    const { result } = renderHook(() => useResource("/api/whatever"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("not_found");
  });

  it("keeps the body alongside the code when the body was not JSON", async () => {
    // The failure that started this: the API answered with a plain-text
    // "Internal Server Error", the page said "parse_failed", and the reason
    // was thrown away.
    mockApiFetch.mockRejectedValue(
      apiError({ error: "parse_failed", detail: "Internal Server Error" }),
    );
    const { useResource } = await loadUseResource();
    const { result } = renderHook(() => useResource("/api/whatever"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("parse_failed: Internal Server Error");
  });

  it("falls back to load_failed when the error carries no code", async () => {
    mockApiFetch.mockRejectedValue(apiError({ error: "" }));
    const { useResource } = await loadUseResource();
    const { result } = renderHook(() => useResource("/api/whatever"));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBe("load_failed");
  });
});
