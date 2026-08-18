import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { App } from "./App.js";

describe("<App />", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ status: "ok", timestamp: "t" }),
        }),
      ),
    );
  });

  it("renders the Mark-Matrix heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /mark-matrix/i })).toBeTruthy();
  });

  it("shows the API status once the health endpoint resolves", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText("ok")).toBeTruthy());
  });
});
