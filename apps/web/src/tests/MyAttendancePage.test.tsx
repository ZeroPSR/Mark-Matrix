import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StudentMyAttendancePage } from "../pages/student/MyAttendancePage.js";

// vi.mock is hoisted above all imports, so the factory cannot close over
// module-level lets. vi.hoisted shares mutable state with the hoisted
// factory without violating that constraint.
const mockState = vi.hoisted(() => ({
  hasEnrollment: true,
  summary: {
    studentId: "u1",
    total: 4,
    present: 4,
    late: 0,
    absent: 0,
    percent: 100,
  },
}));

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockImplementation((path: string) => {
    if (path.endsWith("/api/student/enrollment")) {
      return Promise.resolve({
        data: mockState.hasEnrollment
          ? [
              {
                id: "enr-1",
                enrollmentDate: "2024-08-01T00:00:00Z",
                batchId: "b1",
                programId: "p1",
                semId: "s1",
                semester: { id: "s1", number: 1, programId: "p1", batchId: "b1" },
              },
            ]
          : [],
      });
    }
    if (path.startsWith("/api/admin/courses")) {
      return Promise.resolve({ data: [{ id: "c1", code: "CS101", title: "Intro" }] });
    }
    if (path.endsWith("/attendance/summary")) {
      return Promise.resolve({ data: [mockState.summary] });
    }
    if (path.endsWith("/attendance")) {
      return Promise.resolve({
        data: [
          {
            id: "a1",
            courseId: "c1",
            studentId: "u1",
            sessionDate: "2026-09-01",
            status: "present",
            recordedBy: "f1",
            createdAt: "2026-09-01T00:00:00Z",
          },
          {
            id: "a2",
            courseId: "c1",
            studentId: "u1",
            sessionDate: "2026-09-02",
            status: "late",
            recordedBy: "f1",
            createdAt: "2026-09-02T00:00:00Z",
          },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  }),
}));

describe("StudentMyAttendancePage", () => {
  beforeEach(() => {
    mockState.hasEnrollment = true;
    mockState.summary = {
      studentId: "u1",
      total: 4,
      present: 4,
      late: 0,
      absent: 0,
      percent: 100,
    };
  });

  it("renders the page title and the summary + session tables for the only course", async () => {
    render(<StudentMyAttendancePage />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "My Attendance" })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { level: 2, name: "Semester 1" })).toBeInTheDocument();

    // The summary and session tables render once the course list has loaded.
    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { level: 3, name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Sessions" })).toBeInTheDocument();

    // The course code appears in the summary table and on every session row.
    expect(screen.getAllByText("CS101")).toHaveLength(3);
    expect(screen.getByText("Intro")).toBeInTheDocument();
    expect(screen.getByText("4P / 0L / 0A of 4")).toBeInTheDocument();
    expect(screen.getByText("2026-09-01")).toBeInTheDocument();
    expect(screen.getByText("2026-09-02")).toBeInTheDocument();
    expect(screen.getByText("present")).toBeInTheDocument();
    expect(screen.getByText("late")).toBeInTheDocument();
    // Attendance is healthy, so no threshold warning is shown.
    expect(screen.queryByText(/attendance threshold/)).toBeNull();
  });

  it("warns when a course falls below the attendance threshold", async () => {
    mockState.summary = {
      studentId: "u1",
      total: 5,
      present: 3,
      late: 0,
      absent: 2,
      percent: 60,
    };
    render(<StudentMyAttendancePage />);

    await waitFor(() => {
      expect(screen.getByText(/below the 75% attendance threshold/)).toBeInTheDocument();
    });
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText("3P / 0L / 2A of 5")).toBeInTheDocument();
  });

  it("shows an empty state when the student has no enrollments", async () => {
    mockState.hasEnrollment = false;
    render(<StudentMyAttendancePage />);

    await waitFor(() => {
      expect(screen.getByText("No enrollments yet.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { level: 2, name: "Semester 1" })).toBeNull();
  });
});
