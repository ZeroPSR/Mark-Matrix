import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { AssignmentsPage } from "../pages/admin/AssignmentsPage.js";

const useResourceMock = vi.fn();
vi.mock("../lib/useResource.js", () => ({
  useResource: (...args: unknown[]) => useResourceMock(...args),
}));

const apiFetchMock = vi.fn();
vi.mock("../lib/api.js", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

// The page calls `useResource` once per endpoint, so the mock has to answer
// per path. A single shared return value would hand the assignment payload to
// the course and faculty lookups as well.
interface ResourceState {
  data?: unknown;
  loading?: boolean;
  error?: string | null;
  refetch?: () => void;
}

const resources = new Map<string, ResourceState>();

const reloadMock = vi.fn();

beforeEach(() => {
  resources.clear();
  useResourceMock.mockReset();
  useResourceMock.mockImplementation((path: string | null) => {
    const state = path !== null ? resources.get(path) : undefined;
    return {
      data: state?.data !== undefined ? state.data : { data: [] },
      loading: state?.loading ?? false,
      error: state?.error ?? null,
      refetch: state?.refetch ?? (() => {}),
    };
  });

  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({});

  // The page reloads the document after every mutation.
  vi.stubGlobal("location", { reload: reloadMock });
  reloadMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Registers the payload `useResource` resolves with for `path`. */
function mockResource(path: string, envelope: unknown): void {
  resources.set(path, { data: envelope });
}

/** Registers a failed load for `path`. */
function mockResourceError(path: string, error: string, refetch: () => void = () => {}): void {
  resources.set(path, { error, refetch });
}

/** Registers an in-flight load for `path`. */
function mockResourceLoading(path: string): void {
  resources.set(path, { loading: true });
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

/**
 * CSS-module class names are scoped (`_right_<hash>`), so match on the local
 * name rather than on the emitted class.
 */
function hasScopedClass(element: HTMLElement, localName: string): boolean {
  const pattern = new RegExp(`(^|_)${localName}(_|$)`);
  return element.className.split(/\s+/).some((token) => pattern.test(token));
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

    // Each Remove action names the assignment it deletes, so a screen-reader
    // user can tell the rows apart.
    const removeButtons = within(table).getAllByRole("button", { name: /remove assignment for/i });
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons[0]).toHaveAccessibleName(/Dr Smith/);
    expect(removeButtons[1]).toHaveAccessibleName(/Prof Jones/);
  });

  it("renders the course cell right-aligned and in the mono face", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, {
      data: [{ id: "cs101", code: "CS101", title: "Intro" }],
    });
    mockResource(ROUTES_CYCLE_2.adminFaculty, {
      data: [{ userId: "f1", name: "Dr Smith" }],
    });
    mockResource(ROUTES_CYCLE_2.adminFacultyAssignments, {
      data: [{ id: "a1", facultyId: "f1", courseId: "cs101", assignedDate: "2026-10-15" }],
    });

    renderPage();

    const table = await screen.findByRole("table");
    const cells = within(bodyRows(table)[0] as HTMLElement).getAllByRole("cell");

    expect(hasScopedClass(cells[1] as HTMLElement, "right")).toBe(true);
    expect(hasScopedClass(cells[1] as HTMLElement, "mono")).toBe(true);
    // The faculty name is plain left-aligned body text.
    expect(hasScopedClass(cells[0] as HTMLElement, "right")).toBe(false);
    expect(hasScopedClass(cells[0] as HTMLElement, "mono")).toBe(false);
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

  it("posts the selected course and faculty ids when assigning", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, {
      data: [{ id: "cs101", code: "CS101", title: "Intro" }],
    });
    mockResource(ROUTES_CYCLE_2.adminFaculty, {
      data: [{ userId: "f1", name: "Dr Smith", employeeCode: "EMP1" }],
    });
    mockResource(ROUTES_CYCLE_2.adminFacultyAssignments, { data: [] });

    renderPage();

    fireEvent.change(screen.getByRole("combobox", { name: /^course$/i }), {
      target: { value: "cs101" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /^faculty$/i }), {
      target: { value: "f1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^assign$/i }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(ROUTES_CYCLE_2.adminFacultyAssignments, {
        method: "POST",
        body: JSON.stringify({ facultyId: "f1", courseId: "cs101" }),
      }),
    );
    expect(reloadMock).toHaveBeenCalled();
    expect(await screen.findByText("Assignment created.")).toBeInTheDocument();
  });

  it("deletes the assignment behind a row when Remove is clicked", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, {
      data: [{ id: "cs101", code: "CS101", title: "Intro" }],
    });
    mockResource(ROUTES_CYCLE_2.adminFaculty, {
      data: [{ userId: "f1", name: "Dr Smith", employeeCode: "EMP1" }],
    });
    mockResource(ROUTES_CYCLE_2.adminFacultyAssignments, {
      data: [{ id: "a1", facultyId: "f1", courseId: "cs101", assignedDate: "2026-10-15" }],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /remove assignment for/i }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(ROUTES_CYCLE_2.adminFacultyAssignmentById("a1"), {
        method: "DELETE",
      }),
    );
    expect(reloadMock).toHaveBeenCalled();
  });

  it("surfaces a failed assignment load instead of an empty table", async () => {
    const refetch = vi.fn();
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: [] });
    mockResource(ROUTES_CYCLE_2.adminFaculty, { data: [] });
    mockResourceError(ROUTES_CYCLE_2.adminFacultyAssignments, "load_failed", refetch);

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("load_failed");
    // The empty table would tell the admin there is nothing assigned — a lie.
    expect(screen.queryByText(/no faculty assignments yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Page 1 of 1")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("surfaces a failed course load instead of an empty course list", () => {
    const refetch = vi.fn();
    mockResourceError(ROUTES_CYCLE_2.adminCourses, "courses_load_failed", refetch);
    mockResource(ROUTES_CYCLE_2.adminFaculty, { data: [] });
    mockResource(ROUTES_CYCLE_2.adminFacultyAssignments, { data: [] });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("courses_load_failed");
    expect(screen.queryByRole("combobox", { name: /^course$/i })).not.toBeInTheDocument();
  });

  it("disables the course and faculty selects while their resources are loading", () => {
    mockResourceLoading(ROUTES_CYCLE_2.adminCourses);
    mockResourceLoading(ROUTES_CYCLE_2.adminFaculty);
    mockResource(ROUTES_CYCLE_2.adminFacultyAssignments, { data: [] });

    renderPage();

    expect(screen.getByRole("combobox", { name: /^course$/i })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /^faculty$/i })).toBeDisabled();
  });
});
