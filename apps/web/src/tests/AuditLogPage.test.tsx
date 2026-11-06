import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { AuditLogPage, ACTION_BADGE_VARIANTS } from "../pages/admin/AuditLogPage.js";

// vi.mock is hoisted above the imports, so the mock functions have to be
// created with vi.hoisted to be reachable from the factory.
const apiFetchMock = vi.hoisted(() => vi.fn());
// The API lives on its own host in production, so the mocked `apiUrl`
// resolves every path against that origin.
const API_ORIGIN = vi.hoisted(() => "https://api.mark-matrix.test");
vi.mock("../lib/api.js", () => ({
  apiFetch: apiFetchMock,
  apiUrl: (path: string) => `${API_ORIGIN}${path}`,
}));

// The CSV export is a blob download, so it reads the session token directly.
vi.mock("../lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));

const fakeRows = [
  {
    id: 1,
    created_at: "2026-10-05T10:00:00Z",
    user_id: "u-1",
    action: "update",
    entity: "marks",
    entity_id: "m1",
    old_value: { status: "draft" },
    new_value: { status: "approved" },
  },
];

const USERS = [{ user_id: "u-1", email: "alice@example.com", name: "Alice" }];

/** The CSV export goes through fetch (a blob), not apiFetch. */
const fetchSpy = vi.fn();

beforeEach(() => {
  apiFetchMock.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  mockEndpoints();
});

/** Serve the users list and the audit-log page the page asks for. */
function mockEndpoints(
  rows: unknown[] = fakeRows,
  total = rows.length,
  users: unknown[] = USERS,
): void {
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/admin/users")) return { users };
    return { data: rows, page: 1, pageSize: 50, total };
  });
}

function renderPage() {
  return render(<AuditLogPage />);
}

/** Every path the page requested through apiFetch. */
function auditLogCalls(): string[] {
  return apiFetchMock.mock.calls
    .map((c) => c[0] as string)
    .filter((p) => p.includes("/api/admin/audit-log?"));
}

describe("AuditLogPage", () => {
  it("renders the page title, the filter bar and a row from the API response", async () => {
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Audit Log" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Actor" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Entity" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Action" })).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "m1" })).toBeInTheDocument();
    });
  });

  it("resolves the actor through the user map and renders the action as a badge", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "alice@example.com" })).toBeInTheDocument();
    });
    expect(screen.getByRole("cell", { name: "marks" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Target" })).toBeInTheDocument();

    const table = screen.getByRole("table", { name: "Audit log entries" });
    const badge = within(table).getByText("update");
    expect(badge.tagName).toBe("SPAN");
    expect(badge.className).toMatch(/neutral/);
  });

  it("falls back to the raw user id when the user list cannot be loaded", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/admin/users")) throw new Error("users_unavailable");
      return { data: fakeRows, page: 1, pageSize: 50, total: 1 };
    });

    renderPage();

    // The lookup is best-effort: the table still renders, showing the raw id.
    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "u-1" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("cell", { name: "alice@example.com" })).not.toBeInTheDocument();
  });

  it("clicking the timestamp toggles a JSON block with old/new values", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /2026-10-05T10:00:00Z/ })).toBeInTheDocument();
    });
    // The timestamp cell of each row is a button that expands the row.
    const toggle = screen.getByRole("button", { name: /2026-10-05T10:00:00Z/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByText(/"status": "draft"/)).toBeInTheDocument();
    expect(screen.getByText(/"status": "approved"/)).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(screen.queryByText(/"status": "draft"/)).not.toBeInTheDocument();
  });

  it("applying filters triggers a new query with the right params", async () => {
    renderPage();
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalled();
    });
    // The actor list is fetched once and then offered in the actor select.
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "alice@example.com" })).toBeInTheDocument();
    });
    const actorSelect = screen.getByRole("combobox", { name: "Actor" });
    fireEvent.change(actorSelect, { target: { value: "u-1" } });
    fireEvent.click(screen.getByRole("button", { name: /apply/i }));
    await waitFor(() => {
      expect(
        auditLogCalls().some((u) => u.includes("userId=u-1")),
      ).toBe(true);
    });
  });

  it("resetting the filters clears them from the query", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "alice@example.com" })).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Action" }), {
      target: { value: "approve" },
    });
    await waitFor(() => {
      expect(auditLogCalls().some((u) => u.includes("action=approve"))).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    await waitFor(() => {
      const last = auditLogCalls().at(-1) ?? "";
      expect(last).not.toContain("action=");
    });
  });

  it("pagination next updates the page state", async () => {
    mockEndpoints(fakeRows, 60);
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();
    });
    const nextBtn = screen.getByRole("button", { name: "Next" });
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(auditLogCalls().some((u) => u.includes("page=2"))).toBe(true);
    });
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("export CSV button triggers a download of every matching row", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    fetchSpy.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob() });

    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "m1" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => {
      const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes("/api/admin/audit-log/export.csv"))).toBe(true);
    });
    // The export returns every matching row, so it is not paginated.
    const exportUrl = fetchSpy.mock.calls
      .map((c) => c[0] as string)
      .find((u) => u.includes("export.csv")) ?? "";
    expect(exportUrl).not.toContain("page=");
    expect(exportUrl).not.toContain("pageSize=");
    expect(createObjectURL).toHaveBeenCalled();
  });

  it("requests the export against the API origin, not a relative path", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    fetchSpy.mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob() });

    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "m1" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => {
      const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes("export.csv"))).toBe(true);
    });
    const exportUrl = fetchSpy.mock.calls
      .map((c) => c[0] as string)
      .find((u) => u.includes("export.csv")) ?? "";
    // The web app and the API are served from different hosts in
    // production: a relative path would hit the web origin, 404, and the
    // admin would click "Export CSV" and see nothing happen.
    expect(exportUrl.startsWith(API_ORIGIN)).toBe(true);
    expect(exportUrl.startsWith("/")).toBe(false);
  });

  it("surfaces a failed export instead of silently doing nothing", async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500, blob: async () => new Blob() });

    renderPage();
    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "m1" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /export csv/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/export failed/i);
    });
    // A failed download is not a failed query: the log stays on screen.
    expect(screen.getByRole("cell", { name: "m1" })).toBeInTheDocument();
  });

  it("surfaces a failed load and retries on demand", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/admin/users")) return { users: USERS };
      throw Object.assign(new Error("API 500"), { status: 500 });
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to load audit log: 500");
    });

    const before = auditLogCalls().length;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(auditLogCalls().length).toBeGreaterThan(before);
    });
  });

  it("maps the recorded actions to badge variants", () => {
    expect(ACTION_BADGE_VARIANTS["approve"]).toBe("approved");
    expect(ACTION_BADGE_VARIANTS["submit"]).toBe("submitted");
    expect(ACTION_BADGE_VARIANTS["publish"]).toBe("published");
    expect(ACTION_BADGE_VARIANTS["lock"]).toBe("locked");
    expect(ACTION_BADGE_VARIANTS["create"]).toBe("neutral");
    expect(ACTION_BADGE_VARIANTS["delete"]).toBe("neutral");
    expect(ACTION_BADGE_VARIANTS["update"]).toBe("neutral");
    expect(ACTION_BADGE_VARIANTS["unlock"]).toBe("neutral");
  });

  it("renders an unknown action as a neutral chip instead of breaking the table", async () => {
    mockEndpoints([{ ...fakeRows[0], action: "teleport" }]);
    renderPage();

    const table = await screen.findByRole("table", { name: "Audit log entries" });
    const badge = within(table).getByText("teleport");
    expect(badge.className).toMatch(/neutral/);
  });
});
