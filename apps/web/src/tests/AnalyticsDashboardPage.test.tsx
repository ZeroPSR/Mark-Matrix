import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route as RRoute, Routes } from "react-router-dom";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("../lib/api.js", () => ({
  apiFetch: (...args: unknown[]) => {
    const result = apiFetchMock(...args);
    return result ?? Promise.resolve({});
  },
}));

import { AnalyticsDashboardPage } from "../pages/admin/AnalyticsDashboardPage.js";

beforeEach(() => {
  apiFetchMock.mockReset();
});

function renderAtPath(): void {
  render(
    <MemoryRouter initialEntries={["/admin/analytics/b1/p1/s1"]}>
      <Routes>
        <RRoute path="/admin/analytics/:batchId/:programId/:semId" element={<AnalyticsDashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The KPI tile row. */
function kpis(): HTMLElement {
  return screen.getByLabelText("Key figures");
}

const SUMMARY = [
  { courseId: "c1", courseCode: "CS101", courseTitle: "Intro", enrolled: 50, graded: 48, passing: 40, passRate: 83.33, avgPercentage: 72, avgGradePoint: 7.5 },
  { courseId: "c2", courseCode: "CS102", courseTitle: "Maths", enrolled: 40, graded: 40, passing: 28, passRate: 70, avgPercentage: 65, avgGradePoint: 6.8 },
];

describe("AnalyticsDashboardPage (admin)", () => {
  it("renders the cross-course summary table and the key figures of the selected course", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ courses: SUMMARY })
      .mockResolvedValueOnce({ courseId: "c1", total: 48, passing: 40, rate: 83.33 })
      .mockResolvedValueOnce({ toppers: [] })
      .mockResolvedValueOnce({ rows: [] });

    renderAtPath();

    expect(
      await screen.findByRole("heading", { name: "Analytics — Semester s1", level: 1 }),
    ).toBeInTheDocument();

    const picker = await screen.findByRole("combobox", { name: "Course" });
    expect(picker).toHaveValue("c1");

    await waitFor(() => expect(within(kpis()).getByText("83.33%")).toBeInTheDocument());
    expect(within(kpis()).getByText("Enrolled")).toBeInTheDocument();
    expect(within(kpis()).getByText("50")).toBeInTheDocument();
    expect(within(kpis()).getByText("Graded")).toBeInTheDocument();
    expect(within(kpis()).getByText("48")).toBeInTheDocument();
    expect(within(kpis()).getByText("Passed")).toBeInTheDocument();
    expect(within(kpis()).getByText("40")).toBeInTheDocument();
    expect(within(kpis()).getByText("Avg score")).toBeInTheDocument();
    expect(within(kpis()).getByText("72.00%")).toBeInTheDocument();
    expect(within(kpis()).getByText("Avg grade point")).toBeInTheDocument();
    expect(within(kpis()).getByText("7.50")).toBeInTheDocument();

    const summary = within(screen.getByRole("region", { name: "Summary" }));
    const table = summary.getByRole("table");
    expect(
      within(table).getAllByRole("columnheader").map((th) => th.textContent),
    ).toEqual(["Course", "Enrolled", "Graded", "Passing", "Pass rate", "Avg GP"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);

    const firstCells = within(rows[0] as HTMLElement).getAllByRole("cell");
    expect(firstCells[0]).toHaveTextContent("CS101 — Intro");
    expect(firstCells[0]).toHaveTextContent("Active");
    expect(firstCells[1]).toHaveTextContent("50");
    expect(firstCells[2]).toHaveTextContent("48");
    expect(firstCells[3]).toHaveTextContent("40");
    expect(firstCells[4]).toHaveTextContent("83.33%");
    expect(firstCells[5]).toHaveTextContent("7.50");

    const secondCells = within(rows[1] as HTMLElement).getAllByRole("cell");
    expect(secondCells[0]).toHaveTextContent("CS102 — Maths");
    expect(secondCells[4]).toHaveTextContent("70.00%");

    // The pass rate of the selected course.
    const passRate = within(screen.getByRole("region", { name: "Pass rate" }));
    expect(passRate.getByText("40 of 48 (83.33%)")).toBeInTheDocument();

    // One bar per course in the semester.
    expect(
      screen.getByRole("img", { name: "Pass rate for each course in semester s1" }),
    ).toBeInTheDocument();
  });

  it("offers a CSV export for every report", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ courses: SUMMARY })
      .mockResolvedValueOnce({ courseId: "c1", total: 48, passing: 40, rate: 83.33 })
      .mockResolvedValueOnce({ toppers: [] })
      .mockResolvedValueOnce({ rows: [] });

    renderAtPath();

    const csvLinks = await screen.findAllByRole("link", { name: /download csv/i });
    expect(csvLinks).toHaveLength(4);

    const hrefs = csvLinks.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/api/admin/batch/b1/program/p1/sem/s1/analytics/summary/export.csv");
    expect(hrefs).toContain("/api/admin/batch/b1/program/p1/sem/s1/course/c1/analytics/pass-rate/export.csv");
    expect(hrefs).toContain("/api/admin/batch/b1/program/p1/sem/s1/course/c1/analytics/toppers/export.csv");
    expect(hrefs).toContain("/api/admin/batch/b1/program/p1/sem/s1/course/c1/analytics/attendance-shortage/export.csv");
  });

  it("shows the selected course's key figures and reloads the analytics when another course is picked", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ courses: SUMMARY })
      .mockResolvedValueOnce({ courseId: "c1", total: 48, passing: 40, rate: 83.33 })
      .mockResolvedValueOnce({ toppers: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ courseId: "c2", total: 40, passing: 28, rate: 70 });

    renderAtPath();

    const picker = await screen.findByRole("combobox", { name: "Course" });
    await waitFor(() => expect(picker).toHaveValue("c1"));
    await waitFor(() => expect(within(kpis()).getByText("83.33%")).toBeInTheDocument());

    fireEvent.change(picker, { target: { value: "c2" } });

    await waitFor(() => {
      const urls = apiFetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("course/c2/analytics/pass-rate"))).toBe(true);
    });
    await waitFor(() => expect(within(kpis()).getByText("70.00%")).toBeInTheDocument());
    expect(within(kpis()).getByText("28")).toBeInTheDocument();
    expect(picker).toHaveValue("c2");
  });

  it("shows empty states and no chart when the course has no analytics yet", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ courses: SUMMARY })
      .mockResolvedValueOnce({ courseId: "c1", total: 48, passing: 40, rate: 83.33 })
      .mockResolvedValueOnce({ toppers: [] })
      .mockResolvedValueOnce({ rows: [] });

    renderAtPath();

    const topScores = await screen.findByRole("region", { name: "Top scores" });
    expect(within(topScores).queryByRole("img")).toBeNull();
    expect(within(topScores).getByText("No scores to plot yet.")).toBeInTheDocument();
    expect(within(topScores).getByText("No top scores recorded.")).toBeInTheDocument();

    const attendance = screen.getByRole("region", { name: "Attendance shortage" });
    expect(within(attendance).queryByRole("img")).toBeNull();
    expect(within(attendance).getByText("No attendance shortfalls recorded.")).toBeInTheDocument();
  });
});
