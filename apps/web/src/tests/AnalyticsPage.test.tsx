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

import { AnalyticsPage } from "../pages/faculty/AnalyticsPage.js";

beforeEach(() => {
  apiFetchMock.mockReset();
});

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/faculty/analytics"]}>
      <Routes>
        <RRoute path="/faculty/analytics" element={<AnalyticsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** The KPI tile row. */
function kpis(): HTMLElement {
  return screen.getByLabelText("Key figures");
}

describe("AnalyticsPage (faculty)", () => {
  it("shows the course picker and the key figures of the selected course", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ courses: [{ id: "c1", code: "CS101", title: "Intro" }] })
      .mockResolvedValueOnce({ courseId: "c1", total: 30, passing: 25, rate: 83.33 })
      .mockResolvedValueOnce({ toppers: [] })
      .mockResolvedValueOnce({ rows: [] });

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Analytics", level: 1 }),
    ).toBeInTheDocument();

    const picker = await screen.findByRole("combobox", { name: "Course" });
    expect(picker).toHaveValue("c1");

    await waitFor(() => expect(within(kpis()).getByText("83.33%")).toBeInTheDocument());
    expect(within(kpis()).getByText("Students")).toBeInTheDocument();
    expect(within(kpis()).getByText("30")).toBeInTheDocument();
    expect(within(kpis()).getByText("Passed")).toBeInTheDocument();
    expect(within(kpis()).getByText("25")).toBeInTheDocument();
    expect(within(kpis()).getByText("Top score")).toBeInTheDocument();
    expect(within(kpis()).getByText("Short on attendance")).toBeInTheDocument();
    expect(within(kpis()).getByText("0")).toBeInTheDocument();

    // The faculty page never offered a CSV export.
    expect(screen.queryByText(/download csv/i)).not.toBeInTheDocument();
  });

  it("plots the pass rate and lists the underlying scores and attendance rows", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ courses: [{ id: "c1", code: "CS101", title: "Intro" }] })
      .mockResolvedValueOnce({ courseId: "c1", total: 30, passing: 25, rate: 83.33 })
      .mockResolvedValueOnce({
        toppers: [
          { studentId: "s1", rollNumber: "21", totalObtained: 88, totalMax: 100, percentage: 88, gradeLabel: "A", gradePoint: 8.5 },
          { studentId: "s2", rollNumber: "22", totalObtained: 72, totalMax: 100, percentage: 72, gradeLabel: "B", gradePoint: 7 },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { studentId: "s3", rollNumber: "23", presentCount: 40, totalSessions: 60, percentage: 66.67 },
        ],
      });

    renderPage();

    // The pass-rate chart is named after the figure it draws.
    expect(
      await screen.findByRole("img", { name: /pass rate: 25 of 30 students passed/i }),
    ).toBeInTheDocument();

    const topScores = within(screen.getByRole("region", { name: "Top scores" }));
    expect(topScores.getByRole("img", { name: /score curve across the top 2 students/i })).toBeInTheDocument();

    const topperTable = topScores.getByRole("table");
    expect(
      within(topperTable).getAllByRole("columnheader").map((th) => th.textContent),
    ).toEqual(["Roll", "Total", "%", "Grade", "GP"]);
    const topperRows = within(topperTable).getAllByRole("row").slice(1);
    expect(topperRows).toHaveLength(2);
    expect(
      within(topperRows[0] as HTMLElement).getAllByRole("cell").map((c) => c.textContent),
    ).toEqual(["21", "88/100", "88.00", "A", "8.50"]);

    const attendance = within(screen.getByRole("region", { name: "Attendance shortage" }));
    expect(attendance.getByRole("img", { name: /attendance percentage per student/i })).toBeInTheDocument();

    const attendanceTable = attendance.getByRole("table");
    expect(
      within(attendanceTable).getAllByRole("columnheader").map((th) => th.textContent),
    ).toEqual(["Roll", "Present", "Sessions", "%"]);
    const attendanceRows = within(attendanceTable).getAllByRole("row").slice(1);
    expect(attendanceRows).toHaveLength(1);
    expect(
      within(attendanceRows[0] as HTMLElement).getAllByRole("cell").map((c) => c.textContent),
    ).toEqual(["23", "40", "60", "66.67"]);
  });

  it("shows empty states and no chart when the course has no analytics yet", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ courses: [{ id: "c1", code: "CS101", title: "Intro" }] })
      .mockResolvedValueOnce({ courseId: "c1", total: 30, passing: 25, rate: 83.33 })
      .mockResolvedValueOnce({ toppers: [] })
      .mockResolvedValueOnce({ rows: [] });

    renderPage();

    const topScores = await screen.findByRole("region", { name: "Top scores" });
    expect(within(topScores).queryByRole("img")).toBeNull();
    expect(within(topScores).getByText("No scores to plot yet.")).toBeInTheDocument();
    expect(within(topScores).getByText("No top scores recorded.")).toBeInTheDocument();

    const attendance = screen.getByRole("region", { name: "Attendance shortage" });
    expect(within(attendance).queryByRole("img")).toBeNull();
    expect(within(attendance).getByText("No attendance figures to plot yet.")).toBeInTheDocument();
    expect(within(attendance).getByText("No attendance shortfalls recorded.")).toBeInTheDocument();
  });

  it("switches the active course when the user picks another course", async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        courses: [
          { id: "c1", code: "CS101", title: "Intro" },
          { id: "c2", code: "CS102", title: "Maths" },
        ],
      })
      .mockResolvedValueOnce({ courseId: "c1", total: 30, passing: 25, rate: 83.33 })
      .mockResolvedValueOnce({ toppers: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValue({ courseId: "c2", total: 10, passing: 4, rate: 40 });

    renderPage();

    const picker = await screen.findByRole("combobox", { name: "Course" });
    await waitFor(() => expect(picker).toHaveValue("c1"));

    fireEvent.change(picker, { target: { value: "c2" } });

    await waitFor(() => {
      const urls = apiFetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("c2/analytics/pass-rate"))).toBe(true);
    });
    await waitFor(() => expect(within(kpis()).getByText("40.00%")).toBeInTheDocument());
    expect(picker).toHaveValue("c2");
  });
});
