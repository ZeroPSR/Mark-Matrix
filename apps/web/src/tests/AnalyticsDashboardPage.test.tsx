import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("AnalyticsDashboardPage (admin)", () => {
  it("renders the cross-course summary table and a default analytics panel", async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        courses: [
          { courseId: "c1", courseCode: "CS101", courseTitle: "Intro", enrolled: 50, graded: 48, passing: 40, passRate: 83.33, avgPercentage: 72, avgGradePoint: 7.5 },
          { courseId: "c2", courseCode: "CS102", courseTitle: "Maths", enrolled: 50, graded: 50, passing: 35, passRate: 70, avgPercentage: 65, avgGradePoint: 6.8 },
        ],
      })
      .mockResolvedValueOnce({ courseId: "c1", total: 48, passing: 40, rate: 83.33 })
      .mockResolvedValueOnce({ toppers: [] })
      .mockResolvedValueOnce({ rows: [] });
    renderAtPath();
    await waitFor(() =>
      expect(
        screen.getAllByText((_, el) => Boolean(el?.textContent?.includes("CS101"))).length,
      ).toBeGreaterThan(0),
    );
    await waitFor(
      () => expect(
        screen.getAllByText((_, el) => Boolean(el?.textContent?.includes("83.33%"))).length
      ).toBeGreaterThan(0),
      { timeout: 3000 },
    );
    const csvLinks = screen.getAllByRole("link", { name: /download csv/i });
    expect(csvLinks.length).toBeGreaterThan(0);
    const passRateCsv = csvLinks.find((a) => a.getAttribute("href")?.includes("pass-rate/export.csv"));
    expect(passRateCsv).toBeDefined();
  });
});