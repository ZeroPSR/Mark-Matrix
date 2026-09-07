import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StudentMyAttendancePage } from "../pages/student/MyAttendancePage.js";

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockImplementation((path: string) => {
    if (path.endsWith("/api/student/enrollment")) {
      return Promise.resolve({
        data: [
          {
            id: "enr-1",
            enrollmentDate: "2024-08-01T00:00:00Z",
            batchId: "b1",
            programId: "p1",
            semId: "s1",
            semester: { id: "s1", number: 1, programId: "p1", batchId: "b1" },
          },
        ],
      });
    }
    if (path.startsWith("/api/admin/courses")) {
      return Promise.resolve({ data: [{ id: "c1", code: "CS101", title: "Intro" }] });
    }
    if (path.endsWith("/attendance/summary")) {
      return Promise.resolve({ data: [{ studentId: "u1", total: 4, present: 3, late: 1, absent: 0, percent: 100 }] });
    }
    if (path.endsWith("/attendance")) {
      return Promise.resolve({
        data: [
          { id: "a1", courseId: "c1", studentId: "u1", sessionDate: "2026-09-01", status: "present", recordedBy: "f1", createdAt: "2026-09-01T00:00:00Z" },
          { id: "a2", courseId: "c1", studentId: "u1", sessionDate: "2026-09-02", status: "late",    recordedBy: "f1", createdAt: "2026-09-02T00:00:00Z" },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  }),
}));

describe("StudentMyAttendancePage", () => {
  it("renders the heading and shows the percent + history for the only course", async () => {
    render(<StudentMyAttendancePage />);
    expect(screen.getByText("My Attendance")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/100%/)).toBeTruthy();
    });
    expect(screen.getByText(/2026-09-01: present/)).toBeTruthy();
    expect(screen.getByText(/2026-09-02: late/)).toBeTruthy();
  });
});
