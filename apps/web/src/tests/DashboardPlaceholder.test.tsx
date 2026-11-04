import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthState } from "../auth/AuthContext.js";

vi.mock("../auth/AuthContext.js", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../auth/AuthContext.js";
import { DashboardPlaceholder } from "../pages/DashboardPlaceholder.js";

function mockAuth(overrides: Partial<AuthState> = {}): void {
  vi.mocked(useAuth).mockReturnValue({
    userId: null,
    role: null,
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  mockAuth();
});

describe("DashboardPlaceholder", () => {
  it("greets the signed-in user and shows their role", () => {
    mockAuth({ userId: "u1", role: "admin" });
    render(<DashboardPlaceholder />);

    expect(screen.getByRole("heading", { name: /welcome, u1/i })).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText(/signed in as a/i)).toBeInTheDocument();
  });

  it("falls back to a generic greeting when there is no user id", () => {
    mockAuth({ userId: null, role: "student" });
    render(<DashboardPlaceholder />);

    expect(screen.getByRole("heading", { name: /welcome, there/i })).toBeInTheDocument();
    expect(screen.getByText("student")).toBeInTheDocument();
  });

  it("says the user is not signed in when there is no role", () => {
    mockAuth({ userId: "u1", role: null });
    render(<DashboardPlaceholder />);

    expect(screen.getByText("You are not signed in.")).toBeInTheDocument();
    expect(screen.queryByText(/signed in as a/i)).toBeNull();
  });
});
