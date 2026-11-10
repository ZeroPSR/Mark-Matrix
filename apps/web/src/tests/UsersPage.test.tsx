import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { UsersPage } from "../pages/admin/UsersPage.js";
import { apiFetch } from "../lib/api.js";

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

const profilesMock = vi.fn();
vi.mock("../lib/useResource.js", () => ({
  useResource: () => profilesMock(),
}));

beforeEach(() => {
  profilesMock.mockReset();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetch).mockResolvedValue({});
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

describe("UsersPage — add user", () => {
  /** Opens the dialog and fills the fields every user needs. */
  function openAndFill(): void {
    fireEvent.click(screen.getByRole("button", { name: /add user/i }));
    fireEvent.change(screen.getByLabelText(/^name/i), { target: { value: "New Student" } });
    fireEvent.change(screen.getByLabelText(/^email/i), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: "not-a-real-password" },
    });
  }

  it("opens the dialog when the button is pressed", () => {
    mockUseResource({ users: [] });
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /add user/i }));
    expect(screen.getByRole("dialog", { name: /add user/i })).toBeInTheDocument();
  });

  it("posts a new student to the API and reloads the list", async () => {
    const refetch = vi.fn();
    mockUseResource({ users: [] }, false, null, refetch);
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    openAndFill();
    // The satellite's roll number is NOT NULL, so the form asks for it.
    fireEvent.change(screen.getByLabelText(/roll number/i), {
      target: { value: "23BCA014" },
    });
    fireEvent.change(screen.getByLabelText(/admission year/i), {
      target: { value: "2023" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    const [path, init] = vi.mocked(apiFetch).mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/admin/users");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "New Student",
      email: "new@example.com",
      password: "not-a-real-password",
      role: "student",
      rollNumber: "23BCA014",
      admissionYear: 2023,
    });

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks for an employee code instead of a roll number for a faculty user", () => {
    mockUseResource({ users: [] });
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    openAndFill();
    expect(screen.getByLabelText(/roll number/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^role/i), { target: { value: "faculty" } });
    expect(screen.queryByLabelText(/roll number/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/employee code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/department/i)).toBeInTheDocument();
  });

  it("shows the server's field error instead of closing the dialog", async () => {
    mockUseResource({ users: [] });
    vi.mocked(apiFetch).mockRejectedValue({
      status: 400,
      body: {
        error: "validation_failed",
        fields: [{ path: "rollNumber", message: "A student needs a roll number." }],
      },
    });
    render(
      <MemoryRouter>
        <UsersPage />
      </MemoryRouter>,
    );

    openAndFill();
    fireEvent.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() =>
      expect(screen.getByText("A student needs a roll number.")).toBeInTheDocument(),
    );
    // A failed creation keeps the dialog open, with what was already typed.
    expect(screen.getByRole("dialog", { name: /add user/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^name/i)).toHaveValue("New Student");
  });
});