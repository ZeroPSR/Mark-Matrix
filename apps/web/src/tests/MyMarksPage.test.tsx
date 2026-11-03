import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StudentMyMarksPage } from "../pages/student/MyMarksPage.js";

// vi.mock is hoisted above the imports, so the mock function has to be
// created with vi.hoisted to be reachable from the factory.
const apiFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/api.js", () => ({ apiFetch: apiFetchMock }));

interface MockMarksRow {
  id: string;
  courseId: string;
  studentId: string;
  examType: string;
  marksObtained: number;
  maxMarks: number;
  status: string;
  enteredBy: string;
  updatedAt: string;
}

function markRow(over: Partial<MockMarksRow> = {}): MockMarksRow {
  return {
    id: "m1",
    courseId: "c1",
    studentId: "u1",
    examType: "midterm",
    marksObtained: 27,
    maxMarks: 30,
    status: "draft",
    enteredBy: "f1",
    updatedAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

/** Mock the three endpoints the page walks: enrollment → courses → marks. */
function mockApi(marks: MockMarksRow[]): void {
  apiFetchMock.mockImplementation((path: string) => {
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
      return Promise.resolve({ data: marks });
    }
    return Promise.resolve({ data: [] });
  });
}

describe("StudentMyMarksPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("renders the page title and a marks table with one row per exam type", async () => {
    mockApi([
      markRow({ id: "m1", examType: "midterm", marksObtained: 27, maxMarks: 30 }),
      markRow({ id: "m2", examType: "final", marksObtained: 60, maxMarks: 70 }),
    ]);

    render(<StudentMyMarksPage />);

    expect(screen.getByRole("heading", { level: 1, name: "My Marks" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "midterm" })).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { level: 2, name: "Semester 1" })).toBeInTheDocument();

    expect(screen.getByRole("columnheader", { name: "Exam type" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Marks obtained" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Max" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Percentage" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();

    // Marks obtained / max / percentage per exam type.
    expect(screen.getByRole("cell", { name: "27" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "30" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "90%" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "60" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "70" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "86%" })).toBeInTheDocument();

    // Status is rendered as plain text — one cell per row.
    expect(screen.getAllByRole("cell", { name: "draft" })).toHaveLength(2);

    // Rows are sorted by exam type: "final" sorts before "midterm".
    const bodyRows = screen.getAllByRole("row").slice(1);
    expect(bodyRows[0]).toHaveTextContent("final");
    expect(bodyRows[1]).toHaveTextContent("midterm");
  });

  it("shows an em-dash instead of a percentage when maxMarks is 0", async () => {
    mockApi([markRow({ examType: "quiz", marksObtained: 0, maxMarks: 0 })]);

    render(<StudentMyMarksPage />);

    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "quiz" })).toBeInTheDocument();
    });
    expect(screen.getByRole("cell", { name: "—" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "NaN%" })).toBeNull();
  });

  it("flags draft marks as provisional", async () => {
    mockApi([markRow({ status: "draft" })]);

    render(<StudentMyMarksPage />);

    await waitFor(() => {
      expect(screen.getByText(/provisional marks/i)).toBeInTheDocument();
    });
  });

  it("shows an empty state when the student has no enrollments", async () => {
    apiFetchMock.mockImplementation(() => Promise.resolve({ data: [] }));

    render(<StudentMyMarksPage />);

    await waitFor(() => {
      expect(screen.getByText(/no enrollments/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("table")).toBeNull();
  });
});
