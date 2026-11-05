import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { GradesheetAdminPage } from "../pages/admin/GradesheetAdminPage.js";

const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api.js", () => ({ apiFetch: apiFetchMock }));

// The transcript button asks the auth context for the signed-in user.
vi.mock("../auth/AuthContext.js", () => ({
  useAuth: () => ({
    userId: "u1",
    role: "admin",
    loading: false,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

// The transcript button reads the session token from supabase.
vi.mock("../lib/supabase.js", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: "test-token" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

/** What the compile endpoint answers with. */
const COMPILED = {
  compiled: 2,
  incompleteCourses: [],
  students: [
    { studentId: "u1", sgpa: 8.5, courseCount: 3, totalCredits: 12 },
    { studentId: "u2", sgpa: 7.25, courseCount: 2, totalCredits: 8 },
  ],
};

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockImplementation(async (path: string) => {
    if (path.endsWith("/compile")) return COMPILED;
    if (path.endsWith("/lock")) return { locked: 2 };
    if (path.endsWith("/publish")) return { published: 2 };
    return {};
  });
});

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/admin/gradesheets/b1/p1/s1"]}>
      <Routes>
        <Route
          path="/admin/gradesheets/:batchId/:programId/:semId"
          element={<GradesheetAdminPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("GradesheetAdminPage", () => {
  it("renders the four lifecycle buttons", () => {
    renderPage();

    expect(screen.getByRole("button", { name: "1. Compile" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2. Lock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3. Publish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unlock" })).toBeInTheDocument();
  });

  it("shows the heading, the status badge and the semester metadata", () => {
    renderPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Gradesheet — Semester s1" }),
    ).toBeInTheDocument();

    // The admin API exposes only the gradesheet's actions, so the stage this
    // page shows is the one reached in this session — none yet.
    expect(screen.getByText("draft").className).toMatch(/draft/);
    expect(screen.getByText("Not compiled in this session yet.")).toBeInTheDocument();

    expect(screen.getByText("Batch")).toBeInTheDocument();
    expect(screen.getByText("b1")).toBeInTheDocument();
    expect(screen.getByText("Program")).toBeInTheDocument();
    expect(screen.getByText("p1")).toBeInTheDocument();
    expect(screen.getByText("Semester")).toBeInTheDocument();
    expect(screen.getByText("s1")).toBeInTheDocument();
    // Nothing is compiled yet, so the count is the empty cell's dash.
    expect(screen.getByText("Students compiled")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("compiles the semester and lists the compiled students", async () => {
    renderPage();

    expect(screen.getByText(/Compile the semester to build its gradesheets/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "1. Compile" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        ROUTES_CYCLE_2.adminSemGradesheetAction("admin", "b1", "p1", "s1", "compile"),
        { method: "POST", body: "{}" },
      ),
    );

    const table = await screen.findByRole("table");
    expect(
      within(table).getAllByRole("columnheader").map((th) => th.textContent),
    ).toEqual(["Student", "SGPA", "Courses", "Credits", "Transcript"]);
    expect(within(table).getByRole("cell", { name: "u1" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "8.50" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "12" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "u2" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "7.25" })).toBeInTheDocument();
    // One transcript download per compiled student.
    expect(within(table).getAllByRole("button", { name: "Download" })).toHaveLength(2);

    // The stage follows the action that succeeded.
    expect(screen.getByText("compiled").className).toMatch(/compiled/);
    expect(screen.getByText("Compiled in this session.")).toBeInTheDocument();
    expect(screen.getByText("Compiled 2 students.")).toBeInTheDocument();
  });

  it("publishes the semester", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "3. Publish" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        ROUTES_CYCLE_2.adminSemGradesheetAction("admin", "b1", "p1", "s1", "publish"),
        { method: "POST", body: "{}" },
      ),
    );
    expect(screen.getByText("published").className).toMatch(/published/);
    expect(screen.getByText("Published 2 gradesheets.")).toBeInTheDocument();
  });

  it("unlocks the gradesheet with the reason the admin gives", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));

    const dialog = screen.getByRole("dialog", { name: "Unlock record" });
    fireEvent.change(within(dialog).getByLabelText("Reason"), {
      target: { value: "regrade needed" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Unlock" }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        ROUTES_CYCLE_2.adminSemGradesheetAction("admin", "b1", "p1", "s1", "unlock"),
        { method: "POST", body: JSON.stringify({ reason: "regrade needed" }) },
      ),
    );
    expect(screen.getByText("Unlocked. You can re-compile and re-publish.")).toBeInTheDocument();
  });

  it("names the courses that are still missing when a semester cannot be compiled", async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/compile")) {
        throw Object.assign(new Error("API 422"), {
          body: { error: "incomplete_sem", incompleteCourses: [{ courseCode: "CS101" }] },
        });
      }
      return {};
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "1. Compile" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Incomplete: CS101");
  });
});
