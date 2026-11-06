import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("./auth/AuthContext.js", () => ({
  useAuth: () => ({
    userId: "u1", role: "admin", loading: false,
    signIn: vi.fn(), signOut: vi.fn(),
  }),
}));

// Pages imported by <App /> transitively import api.ts -> supabase.ts, whose
// createClient() call initializes the realtime client and demands a global
// WebSocket. happy-dom does not provide one, so stub the supabase module.
vi.mock("./lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}));

import { App } from "./App.js";

describe("<App />", () => {
  beforeEach(() => {
    // The App pulls in auth context; nothing to reset here, but kept for
    // future extension.
  });

  it("renders the dashboard with a Mark-Matrix wordmark when authenticated", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    // The wordmark is a brand, not a heading: the dashboard's PageTitle
    // owns the page's single level-1 heading.
    expect(screen.getByText("Mark-Matrix")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /welcome/i })).toBeInTheDocument();
  });
});
