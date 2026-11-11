import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "../shell/AppShell.js";
import type { AuthState } from "../auth/AuthContext.js";

vi.mock("../auth/AuthContext.js", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../auth/AuthContext.js";

function mockAuth(auth: Partial<AuthState>): void {
  vi.mocked(useAuth).mockReturnValue({
    userId: null, role: null, userName: null, loading: false,
    signIn: vi.fn(), signOut: vi.fn(),
    ...auth,
  });
}

describe("AppShell", () => {
  it("renders the brand and the user's role", () => {
    mockAuth({ userId: "u1", role: "admin" });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    // The wordmark is a brand, not a heading: the shell carries no level-1
    // heading of its own, so the page title can be the page's only h1.
    expect(screen.getByText("Mark-Matrix")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("shows the user's name in the header, not their id", () => {
    mockAuth({ userId: "8f14e45f-ceea-467a-9c3a-1b2c3d4e5f60", role: "admin", userName: "Anita Rao" });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByText("Anita Rao")).toBeInTheDocument();
    expect(
      screen.queryByText("8f14e45f-ceea-467a-9c3a-1b2c3d4e5f60"),
    ).not.toBeInTheDocument();
  });

  it("shows only Dashboard for a student", () => {
    mockAuth({ userId: "u1", role: "student" });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "My Courses" })).toBeNull();
    expect(screen.getByRole("link", { name: "My Results" })).toBeInTheDocument();
  });

  it("shows only Dashboard and My Courses for a faculty member", () => {
    mockAuth({ userId: "u1", role: "faculty" });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "My Courses" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Users" })).toBeNull();
    expect(screen.queryByRole("link", { name: "My Results" })).toBeNull();
  });

  it("shows Dashboard and Users for an admin", () => {
    mockAuth({ userId: "u1", role: "admin" });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Users" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My Courses" })).toBeNull();
    expect(screen.queryByRole("link", { name: "My Results" })).toBeNull();
  });

  it("calls signOut when the sign-out button is clicked", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    mockAuth({ userId: "u1", role: "admin", signOut });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    screen.getByRole("button", { name: /sign out/i }).click();
    expect(signOut).toHaveBeenCalled();
  });

  it("shows the loading state before the session resolves", () => {
    mockAuth({ userId: null, role: null });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("marks the header and nav print-hidden so printing drops the chrome", () => {
    mockAuth({ userId: "u1", role: "admin" });
    render(<MemoryRouter><AppShell /></MemoryRouter>);
    expect(screen.getByRole("banner")).toHaveAttribute("data-print", "hidden");
    expect(screen.getByRole("navigation")).toHaveAttribute("data-print", "hidden");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
