import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { AssignmentsPage } from "../pages/admin/AssignmentsPage.js";

const useResourceMock = vi.fn();
vi.mock("../lib/useResource.js", () => ({
  useResource: (...args: unknown[]) => useResourceMock(...args),
}));

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

// The page calls `useResource` once per endpoint, so the mock has to answer
// per path. A single shared return value would hand the assignment payload to
// the course and faculty lookups as well.
const resources = new Map<string, unknown>();

beforeEach(() => {
  resources.clear();
  useResourceMock.mockReset();
  useResourceMock.mockImplementation((path: string | null) => {
    const payload = path !== null ? resources.get(path) : undefined;
    return {
      data: payload !== undefined ? payload : { data: [] },
      loading: false,
      error: null,
      refetch: () => {},
    };
  });
});

function mockResource(path: string, data: unknown): void {
  resources.set(path, data);
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <AssignmentsPage />
    </MemoryRouter>,
  );
}

/** Table body rows, i.e. excluding the header row. */
function bodyRows(table: HTMLElement): HTMLElement[] {
  return within(table).getAllByRole("row").slice(1);
}

describe("AssignmentsPage", () => {
  it("renders the page title, filters, and an empty table when no assignments exist", () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: [] });
    mockResource(ROUTES_CYCLE_2.adminFaculty, { data: [] });
    mockResource(ROUTES_CYCLE_2.adminFacultyAssignments, { data: [] });

    renderPage();

    expect(
      screen.getByRole("heading", { name: /faculty assignments/i, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^course$/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /^faculty$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^assign$/i })).toBeDisabled();
    expect(screen.getByText(/no faculty assignments yet/i)).toBeInTheDocument();
    // Zero assignments still means one (empty) page, never zero.
    expect(screen.getByText("Page 1 of 1")).toBeInTheDocument();
  });

  it("renders one row per assignment with the faculty name left and the course code right", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, {
      data: [
        { id: "cs101", code: "CS101", title: "Intro" },
        { id: "cs202", code: "CS202", title: "Algorithms" },
      ],
    });
    mockResource(ROUTES_CYCLE_2.adminFaculty, {
      data: [
        { userId: "f1", name: "Dr Smith", employeeCode: "EMP1" },
        { userId: "f2", name: "Prof Jones", employeeCode: "EMP2" },
      ],
    });
    mockResource(ROUTES_CYCLE_2.adminFacultyAssignments, {
      data: [
        { id: "a1", facultyId: "f1", courseId: "cs101", assignedDate: "2026-10-15" },
        { id: "a2", facultyId: "f2", courseId: "cs202", assignedDate: "2026-10-16" },
      ],
    });

    renderPage();

    const table = await screen.findByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Faculty", "Course", "Assigned", "Actions"]);

    const rows = bodyRows(table);
    expect(rows).toHaveLength(2);

    const firstCells = within(rows[0] as HTMLElement).getAllByRole("cell");
    expect(firstCells[0]).toHaveTextContent("Dr Smith (EMP1)");
    expect(firstCells[1]).toHaveTextContent("CS101 — Intro");
    expect(firstCells[2]).toHaveTextContent("2026-10-15");

    const secondCells = within(rows[1] as HTMLElement).getAllByRole("cell");
    expect(secondCells[0]).toHaveTextContent("Prof Jones (EMP2)");
    expect(secondCells[1]).toHaveTextContent("CS202 — Algorithms");

    expect(within(table).getAllByRole("button", { name: /^remove$/i })).toHaveLength(2);
  });

  it("keeps the Assign button disabled until both a course and a faculty member are chosen", () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, {
      data: [{ id: "cs101", code: "CS101", title: "Intro" }],
    });
    mockResource(ROUTES_CYCLE_2.adminFaculty, {
      data: [{ userId: "f1", name: "Dr Smith" }],
    });
    mockResource(ROUTES_CYCLE_2.adminFacultyAssignments, { data: [] });

    renderPage();

    const assign = screen.getByRole("button", { name: /^assign$/i });
    expect(assign).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: /^course$/i }), {
      target: { value: "cs101" },
    });
    expect(assign).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: /^faculty$/i }), {
      target: { value: "f1" },
    });
    expect(assign).toBeEnabled();
  });

  it("paginates the assignments by the real row count", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, {
      data: [{ id: "cs101", code: "CS101", title: "Intro" }],
    });
    mockResource(ROUTES_CYCLE_2.adminFaculty, {
      data: [{ userId: "f1", name: "Dr Smith" }],
    });
    mockResource(ROUTES_CYCLE_2.adminFacultyAssignments, {
      data: Array.from({ length: 30 }, (_, i) => ({
        id: `a${i}`,
        facultyId: "f1",
        courseId: "cs101",
        assignedDate: "2026-10-15",
      })),
    });

    renderPage();

    const table = await screen.findByRole("table");
    expect(bodyRows(table)).toHaveLength(25);
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));

    expect(bodyRows(screen.getByRole("table"))).toHaveLength(5);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });
});
