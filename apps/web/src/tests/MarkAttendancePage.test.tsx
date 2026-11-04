import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { FacultyMarkAttendancePage } from "../pages/faculty/MarkAttendancePage.js";

// vi.mock is hoisted above the imports, so the mock function has to be
// created with vi.hoisted to be reachable from the factory.
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api.js", () => ({ apiFetch: apiFetchMock }));

const COURSE = {
  id: "c1",
  code: "CS101",
  title: "Intro to CS",
  semester: { id: "s1", number: 1, programId: "p1", batchId: "b1" },
};

const STUDENTS = [
  { userId: "u1", name: "Asha Rao", rollNumber: "21" },
  { userId: "u2", name: "Bilal Khan", rollNumber: "22" },
];

const ENROLLMENTS = [
  { id: "e1", studentId: "u1", semId: "s1" },
  { id: "e2", studentId: "u2", semId: "s1" },
];

interface MockOptions {
  courses?: unknown[];
  enrollments?: unknown[];
  students?: unknown[];
}

/** Mock the endpoints the page walks: courses → enrollments → students. */
function mockApi(options: MockOptions = {}): void {
  apiFetchMock.mockImplementation((path: string) => {
    if (path === "/api/faculty/courses") {
      return Promise.resolve({ data: options.courses ?? [COURSE] });
    }
    if (path.startsWith("/api/admin/enrollments")) {
      return Promise.resolve({ data: options.enrollments ?? ENROLLMENTS });
    }
    if (path === "/api/admin/students") {
      return Promise.resolve({ data: options.students ?? STUDENTS });
    }
    return Promise.resolve({ data: [] });
  });
}

/** Same as mockApi, but the attendance save fails with the given error body. */
function mockApiWithSaveFailure(body: {
  error?: string;
  detail?: string;
  fields?: { path: string; message: string }[];
}): void {
  apiFetchMock.mockImplementation((path: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return Promise.reject({ body });
    }
    if (path === "/api/faculty/courses") {
      return Promise.resolve({ data: [COURSE] });
    }
    if (path.startsWith("/api/admin/enrollments")) {
      return Promise.resolve({ data: ENROLLMENTS });
    }
    if (path === "/api/admin/students") {
      return Promise.resolve({ data: STUDENTS });
    }
    return Promise.resolve({ data: [] });
  });
}

function renderPage(courseId = "c1"): void {
  render(
    <MemoryRouter initialEntries={[`/faculty/attendance/${courseId}/mark`]}>
      <Routes>
        <Route
          path="/faculty/attendance/:courseId/mark"
          element={<FacultyMarkAttendancePage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FacultyMarkAttendancePage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("renders the page title and one row per enrolled student", async () => {
    mockApi();
    renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "Mark attendance" })).toBeInTheDocument();

    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("Bilal Khan")).toBeInTheDocument();
    expect(screen.getByText("21")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();

    expect(screen.getByRole("columnheader", { name: "Roll" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();

    // Each student's status controls form a named radio group.
    expect(
      screen.getByRole("radiogroup", { name: "Attendance status for Asha Rao" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "present for Asha Rao" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "absent for Asha Rao" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "late for Asha Rao" })).toBeInTheDocument();

    // The session date defaults to today, in YYYY-MM-DD form.
    const date = screen.getByLabelText("Session date") as HTMLInputElement;
    expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps Submit disabled until every student has a status", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    const submit = await screen.findByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "present for Asha Rao" }));
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "absent for Bilal Khan" }));
    expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
  });

  it("counts the statuses marked so far", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await screen.findByText("Asha Rao");
    await user.click(screen.getByRole("radio", { name: "present for Asha Rao" }));
    await user.click(screen.getByRole("radio", { name: "late for Bilal Khan" }));

    const tally = screen.getByText("Present").closest("dl");
    expect(tally?.textContent).toMatch(/Present1/);
    expect(tally?.textContent).toMatch(/Absent0/);
    expect(tally?.textContent).toMatch(/Late1/);
  });

  it("saves the session date and one entry per student", async () => {
    const user = userEvent.setup();
    mockApi();
    renderPage();

    await screen.findByText("Asha Rao");
    await user.click(screen.getByRole("radio", { name: "present for Asha Rao" }));
    await user.click(screen.getByRole("radio", { name: "late for Bilal Khan" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();

    const calls = apiFetchMock.mock.calls as [string, RequestInit | undefined][];
    const post = calls.find(([p, init]) => p.endsWith("/attendance") && init?.method === "POST");
    expect(post).toBeDefined();

    const body = JSON.parse(String(post?.[1]?.body)) as {
      sessionDate: string;
      entries: { studentId: string; status: string }[];
    };
    expect(body.sessionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.entries).toEqual([
      { studentId: "u1", status: "present" },
      { studentId: "u2", status: "late" },
    ]);
  });

  it("shows the collapsible error block when the save fails", async () => {
    const user = userEvent.setup();
    mockApiWithSaveFailure({ error: "validation_failed", detail: "session date is invalid" });
    renderPage();

    await screen.findByText("Asha Rao");
    await user.click(screen.getByRole("radio", { name: "present for Asha Rao" }));
    await user.click(screen.getByRole("radio", { name: "absent for Bilal Khan" }));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    const summary = await screen.findByText("Errors (1)");
    const block = summary.closest("details");
    expect(block).not.toBeNull();
    expect(block).toHaveAttribute("open");
    expect(within(block as HTMLElement).getByText("session")).toBeInTheDocument();
    expect(within(block as HTMLElement).getByText("session date is invalid")).toBeInTheDocument();
  });

  it("shows an empty state when no students are enrolled", async () => {
    mockApi({ enrollments: [] });
    renderPage();

    expect(
      await screen.findByText("No students enrolled in this course yet."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a not-found state when the course id does not match", async () => {
    mockApi({ courses: [{ ...COURSE, id: "other" }] });
    renderPage("c1");

    expect(await screen.findByText("This course could not be found.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
  });
});
