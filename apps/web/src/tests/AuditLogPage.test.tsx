import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuditLogPage } from "../pages/admin/AuditLogPage.js";

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

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  fetchSpy.mockImplementation(async (url: string) => {
    if (url.includes("/api/admin/users")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ users: [{ user_id: "u-1", email: "alice@example.com", name: "Alice" }] }),
        headers: new Headers({ "content-type": "application/json" }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: fakeRows, page: 1, pageSize: 50, total: 1 }),
      text: async () => "",
      blob: async () => new Blob(),
      headers: new Headers({ "content-type": "application/json" }),
    } as Response;
  });
});

function renderPage() {
  return render(
    <MemoryRouter>
      <AuditLogPage />
    </MemoryRouter>,
  );
}

describe("AuditLogPage", () => {
  it("renders the filter bar and a row from the API response", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("m1")).toBeInTheDocument();
    });
    // The "Apply" button is the page-level filter button (uniquely identifying).
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
  });

  it("clicking a row toggles a JSON block with old/new values", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/update/)).toBeInTheDocument();
    });
    // The first cell of each row is a button with the timestamp text.
    const toggle = screen.getByRole("button", { name: /2026-10-05T10:00:00Z/ });
    fireEvent.click(toggle);
    expect(screen.getByText(/"status": "draft"/)).toBeInTheDocument();
    expect(screen.getByText(/"status": "approved"/)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText(/"status": "draft"/)).not.toBeInTheDocument();
  });

  it("applying filters triggers a new query with the right params", async () => {
    renderPage();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });
    const applyBtn = screen.getByRole("button", { name: /apply/i });
    const userIdInput = screen.getByLabelText(/User \(uuid\)/i);
    fireEvent.change(userIdInput, {
      target: { value: "11111111-1111-1111-1111-111111111111" },
    });
    fireEvent.click(applyBtn);
    await waitFor(() => {
      const auditCalls = fetchSpy.mock.calls
        .map((c) => c[0] as string)
        .filter((u) => typeof u === "string" && u.includes("/api/admin/audit-log?"));
      expect(auditCalls.some((u) => u.includes("userId=11111111-1111-1111-1111-111111111111"))).toBe(true);
    });
  });

  it("pagination next updates the page state", async () => {
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes("/api/admin/users")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ users: [] }),
          headers: new Headers({ "content-type": "application/json" }),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: fakeRows, page: 1, pageSize: 50, total: 60 }),
        text: async () => "",
        blob: async () => new Blob(),
        headers: new Headers({ "content-type": "application/json" }),
      } as Response;
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/update/)).toBeInTheDocument();
    });
    const nextBtn = screen.getByRole("button", { name: /next/i });
    fireEvent.click(nextBtn);
    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => c[0] as string);
      expect(calls.some((u) => typeof u === "string" && u.includes("page=2"))).toBe(true);
    });
  });

  it("export CSV button triggers a download", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/update/)).toBeInTheDocument();
    });
    const exportBtn = screen.getByRole("button", { name: /export/i });
    fireEvent.click(exportBtn);
    await waitFor(() => {
      const calls = fetchSpy.mock.calls.map((c) => c[0] as string);
      expect(calls.some((u) => typeof u === "string" && u.includes("export.csv"))).toBe(true);
    });
    expect(createObjectURL).toHaveBeenCalled();
  });
});
