import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as ReactRouterDom from "react-router-dom";
import type { AuthState } from "../auth/AuthContext.js";

// `vi.mock` is hoisted above the imports, so the shared mutable state has to
// be created with `vi.hoisted` for the mock factories to close over it.
const { mockNavigate, mockSignIn } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockSignIn: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactRouterDom>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("../auth/AuthContext.js", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../auth/AuthContext.js";
import { LoginPage } from "../pages/LoginPage.js";

function mockAuth(overrides: Partial<AuthState> = {}): void {
  vi.mocked(useAuth).mockReturnValue({
    userId: null,
    role: null,
    userName: null,
    loading: false,
    signIn: mockSignIn,
    signOut: vi.fn(),
    ...overrides,
  });
}

async function fillCredentials(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText("Email"), "user@example.com");
  await user.type(screen.getByLabelText("Password"), "hunter2");
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockSignIn.mockReset();
  mockAuth();
});

describe("LoginPage", () => {
  it("renders the brand and both fields associated with their labels", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Mark-Matrix" })).toBeInTheDocument();
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    expect(email).toBeInTheDocument();
    expect(email).toHaveAttribute("type", "email");
    expect(password).toBeInTheDocument();
    expect(password).toHaveAttribute("type", "password");
  });

  it("calls signIn with the entered email and password on submit", async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(mockSignIn).toHaveBeenCalledWith("user@example.com", "hunter2"),
    );
  });

  it("shows the sign-in error and does not navigate when signIn reports one", async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue({ error: "Invalid credentials" });
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid credentials"),
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to the dashboard when signIn succeeds", async () => {
    const user = userEvent.setup();
    mockSignIn.mockResolvedValue({ error: null });
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true }));
  });

  it("disables the submit button while the sign-in request is in flight", async () => {
    const user = userEvent.setup();
    let resolveSignIn: (result: { error: string | null }) => void = () => {};
    mockSignIn.mockImplementation(
      () => new Promise<{ error: string | null }>((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    render(<LoginPage />);

    await fillCredentials(user);
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const busy = await screen.findByRole("button", { name: "Signing in…" });
    expect(busy).toBeDisabled();

    resolveSignIn({ error: null });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled(),
    );
  });
});
