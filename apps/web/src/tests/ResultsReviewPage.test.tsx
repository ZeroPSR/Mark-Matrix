import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { ResultsReviewPage } from "../pages/admin/ResultsReviewPage.js";

const useResourceMock = vi.fn();
vi.mock("../lib/useResource.js", () => ({
  useResource: (...args: unknown[]) => useResourceMock(...args),
}));

const apiFetchMock = vi.fn();
vi.mock("../lib/api.js", () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

interface ResourceState {
  data?: unknown;
  loading?: boolean;
  error?: string | null;
  refetch?: () => void;
}

const resources = new Map<string, ResourceState>();

const reloadMock = vi.fn();

/** The two courses the page lists. */
const COURSES = [
  { id: "c1", code: "CS101", title: "Intro", semester: { id: "s1", number: 1, programId: "p1", batchId: "b1" } },
  { id: "c2", code: "CS102", title: "Data", semester: { id: "s1", number: 1, programId: "p1", batchId: "b1" } },
];

/** A marks row, as the admin marks endpoint returns it. */
function marksRow(id: string, courseId: string, status: string): Record<string, unknown> {
  return {
    id,
    courseId,
    studentId: "u1",
    examType: "midterm",
    marksObtained: 12,
    maxMarks: 20,
    enteredBy: "f1",
    status,
    updatedAt: "2026-10-15T00:00:00Z",
  };
}

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
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path.endsWith("/course/c1/marks")) {
      // Two rows at different stages: the most advanced one wins.
      return { data: [marksRow("m1", "c1", "submitted"), marksRow("m2", "c1", "approved")] };
    }
    if (path.endsWith("/course/c2/marks")) {
      // A course with no marks rows at all.
      return { data: [] };
    }
    return {};
  });

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

/** Every marks read the page made, in order. */
function marksReads(): string[] {
  return apiFetchMock.mock.calls
    .map((c) => c[0] as string)
    .filter((p) => p.endsWith("/marks"));
}

function renderPage(): void {
  render(
    <MemoryRouter>
      <ResultsReviewPage />
    </MemoryRouter>,
  );
}

describe("ResultsReviewPage", () => {
  it("renders the heading and a row per course with the approve, lock and unlock actions", () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: COURSES });

    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Results — Course Approvals" }),
    ).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(
      within(table).getAllByRole("columnheader").map((th) => th.textContent),
    ).toEqual(["Code", "Title", "Semester", "Status", "Actions"]);
    expect(within(table).getByRole("cell", { name: "CS101" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "CS102" })).toBeInTheDocument();

    // Every action names the course it acts on, so the rows can be told apart.
    expect(within(table).getAllByRole("button", { name: /^approve marks for/i })).toHaveLength(2);
    expect(within(table).getAllByRole("button", { name: /^lock marks for/i })).toHaveLength(2);
    expect(within(table).getAllByRole("button", { name: /^unlock marks for/i })).toHaveLength(2);
  });

  it("derives the status of a course from its marks rows", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: COURSES });

    renderPage();

    // CS101 has a submitted and an approved row, so the most advanced one wins.
    const cell = await screen.findByRole("cell", { name: "approved" });
    expect(cell.querySelector("span")?.className).toMatch(/approved/);
  });

  it("leaves a course with no marks rows without a status", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: COURSES });

    renderPage();

    await screen.findByRole("cell", { name: "approved" });
    // CS102 has no marks rows, so the Table renders its empty cell as a dash.
    expect(screen.getByRole("cell", { name: "—" })).toBeInTheDocument();
  });

  it("reads the marks of each course exactly once", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: COURSES });

    renderPage();

    await screen.findByRole("cell", { name: "approved" });
    // There is no course-status endpoint, so the status costs one read per
    // course — and no more than that.
    expect(marksReads()).toEqual([
      ROUTES_CYCLE_2.adminMarks("admin", "b1", "p1", "s1", "c1"),
      ROUTES_CYCLE_2.adminMarks("admin", "b1", "p1", "s1", "c2"),
    ]);
  });

  it("leaves a course without a status when its marks cannot be read", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/course/c1/marks")) throw new Error("API 500");
      return { data: [] };
    });
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: COURSES });

    renderPage();

    await waitFor(() => expect(marksReads()).toHaveLength(2));
    expect(screen.queryByRole("cell", { name: "approved" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("cell", { name: "—" })).toHaveLength(2);
  });

  it("asks for confirmation before approving, and only then posts", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: COURSES });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Approve marks for CS101" }));

    const dialog = screen.getByRole("dialog", { name: "Approve marks for CS101" });
    expect(
      within(dialog).getByRole("heading", { name: "Approve marks for CS101" }),
    ).toBeInTheDocument();
    // Nothing is posted until the admin confirms.
    expect(
      apiFetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/approve")),
    ).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        ROUTES_CYCLE_2.adminCourseMarksAction("admin", "b1", "p1", "s1", "c1", "approve"),
        { method: "POST", body: "{}" },
      ),
    );
    expect(reloadMock).toHaveBeenCalled();
  });

  it("cancelling the confirmation leaves the course untouched", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: COURSES });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Approve marks for CS101" }));
    const dialog = screen.getByRole("dialog", { name: "Approve marks for CS101" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      apiFetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/approve")),
    ).toHaveLength(0);
  });

  it("unlocks a course with the reason the admin gives", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: COURSES });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Unlock marks for CS101" }));

    const dialog = screen.getByRole("dialog", { name: "Unlock record" });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "faculty typo in midterm marks" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        ROUTES_CYCLE_2.adminCourseMarksAction("admin", "b1", "p1", "s1", "c1", "unlock"),
        { method: "POST", body: JSON.stringify({ reason: "faculty typo in midterm marks" }) },
      ),
    );
    expect(reloadMock).toHaveBeenCalled();
  });

  it("locks a course without asking for confirmation", async () => {
    mockResource(ROUTES_CYCLE_2.adminCourses, { data: COURSES });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Lock marks for CS101" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        ROUTES_CYCLE_2.adminCourseMarksAction("admin", "b1", "p1", "s1", "c1", "lock"),
        { method: "POST", body: "{}" },
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("surfaces a failed load instead of an empty course list", () => {
    const refetch = vi.fn();
    resources.set(ROUTES_CYCLE_2.adminCourses, { error: "load_failed", refetch });

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("load_failed");
    expect(screen.queryByText("No courses yet.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
