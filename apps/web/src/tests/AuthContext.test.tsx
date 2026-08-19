import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { AuthProvider, useAuth, type AuthState } from "../auth/AuthContext.js";

// Mock the supabase client.
const mockSignIn = vi.fn();
const mockSignOut = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock("../lib/supabase.js", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...args: unknown[]) => mockSignIn(...args),
      signOut: () => mockSignOut(),
      getSession: () => mockGetSession(),
      onAuthStateChange: (cb: unknown) => {
        mockOnAuthStateChange(cb);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  },
}));

function Probe(): JSX.Element {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="userId">{auth.userId ?? "null"}</span>
      <span data-testid="role">{auth.role ?? "null"}</span>
      <span data-testid="loading">{String(auth.loading)}</span>
      <button onClick={() => void auth.signIn("a@b.c", "pw")}>sign in</button>
      <button onClick={() => void auth.signOut()}>sign out</button>
    </div>
  );
}

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignOut.mockReset();
  mockGetSession.mockReset();
  mockOnAuthStateChange.mockReset();
  mockGetSession.mockResolvedValue({ data: { session: null } });
});

describe("AuthContext", () => {
  it("starts in loading state with no user", async () => {
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("userId")).toHaveTextContent("null");
    expect(screen.getByTestId("role")).toHaveTextContent("null");
  });

  it("hydrates from getSession with user/role", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "u1", app_metadata: { role: "admin" } },
        },
      },
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("userId")).toHaveTextContent("u1"));
    expect(screen.getByTestId("role")).toHaveTextContent("admin");
  });

  it("ignores invalid role values from app_metadata", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          user: { id: "u1", app_metadata: { role: "wizard" } },
        },
      },
    });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    expect(screen.getByTestId("role")).toHaveTextContent("null");
  });

  it("signIn delegates to supabase", async () => {
    mockSignIn.mockResolvedValueOnce({ data: {}, error: null });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    await act(async () => {
      screen.getByText("sign in").click();
    });
    expect(mockSignIn).toHaveBeenCalledWith({ email: "a@b.c", password: "pw" });
  });

  it("returns error.message from signIn", async () => {
    mockSignIn.mockResolvedValueOnce({ data: {}, error: { message: "bad creds" } });
    let captured: AuthState | null = null;
    function Capture(): JSX.Element {
      captured = useAuth();
      return <></>;
    }
    render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    );
    await waitFor(() => expect(captured?.loading).toBe(false));
    const c = captured as unknown as AuthState;
    let result: { error: string | null } = { error: null };
    await act(async () => {
      result = await c.signIn("a@b.c", "pw");
    });
    expect(result.error).toBe("bad creds");
  });

  it("signOut delegates to supabase", async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));
    await act(async () => {
      screen.getByText("sign out").click();
    });
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("useAuth throws when used outside AuthProvider", () => {
    // Suppress React's automatic error logging for this expected throw.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow(/must be used inside/);
    errSpy.mockRestore();
  });
});
