import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RosterAttendancePage } from "../pages/faculty/RosterAttendancePage.js";

// The roster page serves both roles, and each role reads from its own
// endpoint. Recording the requested paths is what lets a test pin that
// mapping — mocking one URL for both roles would hide a mismatch, which is
// exactly how an admin session once ended up pointed at a faculty-gated
// route.
const requestedPaths = vi.hoisted(() => [] as string[]);

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockImplementation((path: string) => {
    requestedPaths.push(path);
    if (
      path === "/api/faculty/courses" ||
      path === "/api/admin/courses/hierarchy"
    ) {
      return Promise.resolve({
        data: [
          {
            id: "c1",
            code: "CS101",
            title: "Intro to CS",
            credits: 3,
            semester: { id: "s1", number: 1, programId: "p1", batchId: "b1" },
          },
        ],
      });
    }
    if (path === "/api/faculty/students" || path === "/api/admin/students") {
      return Promise.resolve({
        data: [
          { userId: "u1", name: "Asha Rao", rollNumber: "21" },
          { userId: "u2", name: "Bilal Khan", rollNumber: "22" },
        ],
      });
    }
    if (path.endsWith("/attendance/summary")) {
      return Promise.resolve({
        data: [
          { studentId: "u1", total: 2, present: 1, late: 0, absent: 1, percent: 50 },
          { studentId: "u2", total: 1, present: 0, late: 1, absent: 0, percent: 100 },
        ],
      });
    }
    if (path.endsWith("/attendance")) {
      return Promise.resolve({
        data: [
          { id: "a1", courseId: "c1", studentId: "u1", sessionDate: "2026-09-01", status: "present", recordedBy: "f1", createdAt: "2026-09-01T00:00:00Z" },
          { id: "a2", courseId: "c1", studentId: "u1", sessionDate: "2026-09-02", status: "absent", recordedBy: "f1", createdAt: "2026-09-02T00:00:00Z" },
          { id: "a3", courseId: "c1", studentId: "u2", sessionDate: "2026-09-01", status: "late", recordedBy: "f1", createdAt: "2026-09-01T00:00:00Z" },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  }),
}));

beforeEach(() => {
  requestedPaths.length = 0;
});

function renderRoster(role: "faculty" | "admin"): void {
  render(
    <MemoryRouter initialEntries={[`/${role}/attendance/c1/roster`]}>
      <Routes>
        <Route
          path={`/${role}/attendance/:courseId/roster`}
          element={<RosterAttendancePage role={role} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RosterAttendancePage", () => {
  it("renders the roster grid with an editable cell per student and session", async () => {
    renderRoster("faculty");

    expect(await screen.findByText("Attendance roster — CS101")).toBeInTheDocument();
    expect(screen.getByText("Faculty · Roster")).toBeInTheDocument();
    expect(screen.getByText("Editable roster")).toBeInTheDocument();
    expect(await screen.findByText("2 students with attendance records.")).toBeInTheDocument();

    // One column per session date, plus roll, name and the percentage.
    expect(screen.getByRole("columnheader", { name: "Roll" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "2026-09-01" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "2026-09-02" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "%" })).toBeInTheDocument();

    // Student row: roll number, name and the computed percentage.
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("21")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();

    // Faculty gets a status control per cell, addressable by student + date.
    // The roll number disambiguates students who share a name.
    expect(screen.getByLabelText("Attendance status for Asha Rao (21) on 2026-09-01")).toHaveValue("present");
    expect(screen.getByLabelText("Attendance status for Asha Rao (21) on 2026-09-02")).toHaveValue("absent");
    expect(screen.getByLabelText("Attendance status for Bilal Khan (22) on 2026-09-01")).toHaveValue("late");
  });

  it("renders the same roster read-only for admin", async () => {
    renderRoster("admin");

    expect(await screen.findByText("Attendance roster — CS101")).toBeInTheDocument();
    expect(screen.getByText("Admin · Roster")).toBeInTheDocument();
    expect(screen.getByText("Read-only roster")).toBeInTheDocument();

    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();

    // Statuses are plain text here — there is nothing to edit.
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.getByText("present")).toBeInTheDocument();
    expect(screen.getByText("absent")).toBeInTheDocument();
    expect(screen.getByText("late")).toBeInTheDocument();
  });

  it("reads the roster from the endpoint that matches its role", async () => {
    renderRoster("faculty");
    await screen.findByText("Asha Rao");
    expect(requestedPaths).toContain("/api/faculty/students");
    expect(requestedPaths).toContain("/api/faculty/courses");
    expect(requestedPaths).not.toContain("/api/admin/students");
    expect(requestedPaths).not.toContain("/api/admin/courses/hierarchy");

    requestedPaths.length = 0;
    renderRoster("admin");
    await screen.findByText("Asha Rao");
    expect(requestedPaths).toContain("/api/admin/students");
    expect(requestedPaths).toContain("/api/admin/courses/hierarchy");
    expect(requestedPaths).not.toContain("/api/faculty/students");
    expect(requestedPaths).not.toContain("/api/faculty/courses");
  });
});
