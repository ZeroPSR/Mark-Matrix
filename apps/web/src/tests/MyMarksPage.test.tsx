import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StudentMyMarksPage } from "../pages/student/MyMarksPage.js";

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
    if (path.endsWith("/marks")) {
      return Promise.resolve({
        data: [
          { id: "m1", courseId: "c1", studentId: "u1", examType: "midterm", marksObtained: 27, maxMarks: 30, status: "draft", enteredBy: "f1", updatedAt: "2026-09-01T00:00:00Z" },
          { id: "m2", courseId: "c1", studentId: "u1", examType: "final",   marksObtained: 60, maxMarks: 70, status: "draft", enteredBy: "f1", updatedAt: "2026-09-01T00:00:00Z" },
        ],
      });
    }
    return Promise.resolve({ data: [] });
  }),
}));

describe("StudentMyMarksPage", () => {
  it("renders the heading and shows marksObtained/maxMarks for each exam type", async () => {
    render(<StudentMyMarksPage />);
    expect(screen.getByText("My Marks")).toBeTruthy();
    await waitFor(() => {
      // getAllByText: the regex matches the <li> and its child <span>s both.
      // We just need at least one match to confirm the data rendered.
      const matches = screen.getAllByText((_, el) =>
        Boolean(el?.textContent?.match(/midterm.*27.*\/.*30/)),
      );
      expect(matches.length).toBeGreaterThan(0);
    });
    const finals = screen.getAllByText((_, el) =>
      Boolean(el?.textContent?.match(/final.*60.*\/.*70/)),
    );
    expect(finals.length).toBeGreaterThan(0);
  });
});
