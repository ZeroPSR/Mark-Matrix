import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "../auth/ProtectedRoute.js";
import type { AuthState } from "../auth/AuthContext.js";

vi.mock("../auth/AuthContext.js", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../auth/AuthContext.js";

function mockAuth(auth: Partial<AuthState>): void {
  vi.mocked(useAuth).mockReturnValue({
    userId: null, role: null, loading: false,
    signIn: vi.fn(), signOut: vi.fn(),
    ...auth,
  });
}

function renderAt(initialPath: string, element: JSX.Element): void {
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page" />} />
        <Route path="/forbidden" element={<div data-testid="forbidden-page" />} />
        <Route path="/protected" element={element} />
        <Route path="/admin-only" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("renders the loading state when loading=true", () => {
    mockAuth({ loading: true, userId: "u1", role: "admin" });
    renderAt("/protected", <ProtectedRoute><div>child</div></ProtectedRoute>);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it("redirects to /login when not authenticated", () => {
    mockAuth({ userId: null, role: null });
    renderAt("/protected", <ProtectedRoute><div>child</div></ProtectedRoute>);
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
  });

  it("renders children when authenticated and no role filter is set", () => {
    mockAuth({ userId: "u1", role: "student" });
    renderAt("/protected", <ProtectedRoute><div data-testid="child">child</div></ProtectedRoute>);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("renders children when role is in the allowed list", () => {
    mockAuth({ userId: "u1", role: "admin" });
    renderAt(
      "/admin-only",
      <ProtectedRoute roles={["admin"]}><div data-testid="child">child</div></ProtectedRoute>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("redirects to /forbidden when role is not in the allowed list", () => {
    mockAuth({ userId: "u1", role: "faculty" });
    renderAt(
      "/admin-only",
      <ProtectedRoute roles={["admin"]}><div data-testid="child">child</div></ProtectedRoute>,
    );
    expect(screen.getByTestId("forbidden-page")).toBeInTheDocument();
  });

  it("redirects to /forbidden when role is null but roles are required", () => {
    mockAuth({ userId: "u1", role: null });
    renderAt(
      "/admin-only",
      <ProtectedRoute roles={["admin"]}><div data-testid="child">child</div></ProtectedRoute>,
    );
    expect(screen.getByTestId("forbidden-page")).toBeInTheDocument();
  });
});