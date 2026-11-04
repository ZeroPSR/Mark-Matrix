import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UsersPage } from "../pages/admin/UsersPage.js";

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

const profilesMock = vi.fn();
vi.mock("../lib/useResource.js", () => ({
  useResource: () => profilesMock(),
}));

beforeEach(() => {
  profilesMock.mockReset();
});

function mockUseResource(
  data: unknown,
  loading = false,
  error: string | null = null,
  refetch: () => void = () => {},
): void {
  profilesMock.mockReturnValue({ data, loading, error, refetch });
}

describe("UsersPage", () => {
  it("renders the page title and filter bar", async () => {
    mockUseResource({ users: [] });
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /users/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /search users/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /filter by role/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add user/i })).toBeInTheDocument();
  });

  it("renders one row per user with a role badge", async () => {
    mockUseResource({
      users: [
        { user_id: "u-1", name: "Alice", role: "admin", email: "alice@example.com", lastActiveAt: "2026-10-15" },
        { user_id: "u-2", name: "Bob", role: "faculty", email: "bob@example.com", lastActiveAt: null },
      ],
    });
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Alice")).toBeInTheDocument());
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getAllByText("admin").length).toBeGreaterThan(0);
    expect(screen.getAllByText("faculty").length).toBeGreaterThan(0);
  });

  it("shows an empty-state message when there are no users", () => {
    mockUseResource({ users: [] });
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no users match/i)).toBeInTheDocument();
  });

  it("surfaces a failed user load instead of an empty table", () => {
    const refetch = vi.fn();
    mockUseResource(null, false, "load_failed", refetch);
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("load_failed");
    // The empty table would tell the admin there are no users — a lie.
    expect(screen.queryByText(/no users match/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});