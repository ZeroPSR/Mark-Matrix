import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";
import { apiFetch } from "../lib/api.js";
import { EnrollmentsPage } from "../pages/admin/EnrollmentsPage.js";

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

const SEMESTERS = [{ id: "sem-1", programId: "prog-1", number: 3 }];
const STUDENTS = [{ userId: "stu-1", name: "Asha Rao", rollNumber: "23BCA001" }];
const ENROLLMENTS = [
  { id: "enr-1", studentId: "stu-1", semId: "sem-1", enrollmentDate: "2026-08-01" },
];

/** apiFetch answers the three resources the page reads, keyed by path. */
function mockEndpoints(enrollments: unknown[] = ENROLLMENTS): void {
  apiFetchMock.mockImplementation((path: string) => {
    if (path === "/api/admin/semesters") return Promise.resolve({ data: SEMESTERS });
    if (path === "/api/admin/students") return Promise.resolve({ data: STUDENTS });
    if (path === "/api/admin/enrollments") return Promise.resolve({ data: enrollments });
    return Promise.resolve({ data: [] });
  });
}

/** The rows currently rendered in the enrollments table body. */
function bodyRows(): HTMLElement[] {
  const tbody = screen.getByRole("table").querySelector("tbody");
  return tbody === null ? [] : Array.from(tbody.querySelectorAll("tr"));
}

describe("EnrollmentsPage", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("renders the page title and resolves student and semester names in the table", async () => {
    mockEndpoints();
    render(<EnrollmentsPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Enrollments" })).toBeInTheDocument();

    await waitFor(() => {
      expect(within(screen.getByRole("table")).getByText("Asha Rao")).toBeInTheDocument();
    });
    const table = screen.getByRole("table");
    expect(within(table).getByText("Semester 3")).toBeInTheDocument();
    expect(within(table).getByText("23BCA001")).toBeInTheDocument();
    expect(within(table).getByText("2026-08-01")).toBeInTheDocument();
  });

  it("falls back to the raw ids when a student or semester cannot be resolved", async () => {
    mockEndpoints([
      { id: "enr-1", studentId: "stu-9", semId: "sem-9", enrollmentDate: "2026-08-01" },
    ]);
    render(<EnrollmentsPage />);

    await waitFor(() => {
      expect(within(screen.getByRole("table")).getByText("stu-9")).toBeInTheDocument();
    });
    const table = screen.getByRole("table");
    expect(within(table).getByText("sem-9")).toBeInTheDocument();
  });

  it("shows an empty-state message when there are no enrollments", async () => {
    mockEndpoints([]);
    render(<EnrollmentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/no enrollments yet/i)).toBeInTheDocument();
    });
  });

  it("keeps the Enroll button disabled until both a semester and a student are picked", async () => {
    mockEndpoints();
    render(<EnrollmentsPage />);

    const enroll = screen.getByRole("button", { name: "Enroll" });
    expect(enroll).toBeDisabled();

    const semester = screen.getByRole("combobox", { name: "Semester" });
    const student = screen.getByRole("combobox", { name: "Student" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Semester 3" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /Asha Rao/ })).toBeInTheDocument();
    });

    fireEvent.change(semester, { target: { value: "sem-1" } });
    expect(enroll).toBeDisabled();

    fireEvent.change(student, { target: { value: "stu-1" } });
    expect(enroll).toBeEnabled();
  });

  it("only offers the bulk CSV uploader once a semester is picked", async () => {
    mockEndpoints();
    render(<EnrollmentsPage />);

    expect(screen.getByText("Pick a semester above to enable bulk upload.")).toBeInTheDocument();

    const semester = screen.getByRole("combobox", { name: "Semester" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Semester 3" })).toBeInTheDocument();
    });
    fireEvent.change(semester, { target: { value: "sem-1" } });

    expect(screen.queryByText("Pick a semester above to enable bulk upload.")).toBeNull();
    expect(screen.getByLabelText("CSV file")).toBeInTheDocument();
  });

  it("posts the selected student and semester to the enrollments endpoint", async () => {
    mockEndpoints();
    render(<EnrollmentsPage />);

    const semester = screen.getByRole("combobox", { name: "Semester" });
    const student = screen.getByRole("combobox", { name: "Student" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Semester 3" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /Asha Rao/ })).toBeInTheDocument();
    });

    fireEvent.change(semester, { target: { value: "sem-1" } });
    fireEvent.change(student, { target: { value: "stu-1" } });

    const enroll = screen.getByRole("button", { name: "Enroll" });
    expect(enroll).toBeEnabled();
    fireEvent.click(enroll);

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(ROUTES_CYCLE_2.adminEnrollments, {
        method: "POST",
        body: JSON.stringify({ studentId: "stu-1", semId: "sem-1" }),
      });
    });
  });

  it("shows 25 enrollment rows per page and pages through the rest", async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `enr-${i + 1}`,
      studentId: `stu-${i + 1}`,
      semId: "sem-1",
      enrollmentDate: "2026-08-01",
    }));
    mockEndpoints(many);
    render(<EnrollmentsPage />);

    await waitFor(() => {
      expect(bodyRows()).toHaveLength(25);
    });
    expect(screen.getByText("stu-25")).toBeInTheDocument();
    expect(screen.queryByText("stu-26")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(bodyRows()).toHaveLength(5);
    });
    expect(screen.getByText("stu-26")).toBeInTheDocument();
    expect(screen.queryByText("stu-25")).toBeNull();
  });

  it("clears the chosen CSV file when the File component's Remove button is clicked", async () => {
    mockEndpoints();
    render(<EnrollmentsPage />);

    const semester = screen.getByRole("combobox", { name: "Semester" });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Semester 3" })).toBeInTheDocument();
    });
    fireEvent.change(semester, { target: { value: "sem-1" } });

    const upload = (): HTMLElement => screen.getByRole("button", { name: "Upload" });
    expect(upload()).toBeDisabled();

    const csv = new window.File(["roll_number\n23BCA001\n"], "enroll.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText("CSV file"), csv);

    await waitFor(() => {
      expect(upload()).toBeEnabled();
    });

    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(upload()).toBeDisabled();
    });
  });
});
