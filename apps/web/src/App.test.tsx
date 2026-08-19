import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("./auth/AuthContext.js", () => ({
  useAuth: () => ({
    userId: "u1", role: "admin", loading: false,
    signIn: vi.fn(), signOut: vi.fn(),
  }),
}));

import { App } from "./App.js";

describe("<App />", () => {
  beforeEach(() => {
    // The App pulls in auth context; nothing to reset here, but kept for
    // future extension.
  });

  it("renders the dashboard with a Mark-Matrix heading when authenticated", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /mark-matrix/i })).toBeInTheDocument();
  });
});
