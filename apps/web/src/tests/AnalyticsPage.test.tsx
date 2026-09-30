import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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

describe("AnalyticsPage (faculty)", () => {
  it("renders the course list and a default analytics panel", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ courses: [{ id: "c1", code: "CS101", title: "Intro" }] })
      .mockResolvedValueOnce({ courseId: "c1", total: 30, passing: 25, rate: 83.33 })
      .mockResolvedValueOnce({ toppers: [] })
      .mockResolvedValueOnce({ rows: [] });
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /CS101/ })).toBeInTheDocument());
    await waitFor(
      () => expect(
        screen.getAllByText((_, el) => Boolean(el?.textContent?.includes("83.33%"))).length
      ).toBeGreaterThan(0),
      { timeout: 3000 },
    );
    expect(screen.queryByText(/download csv/i)).not.toBeInTheDocument();
  });

  it("switches the active course when the user clicks another course", async () => {
    apiFetchMock
      .mockResolvedValueOnce({
        courses: [
          { id: "c1", code: "CS101", title: "Intro" },
          { id: "c2", code: "CS102", title: "Maths" },
        ],
      })
      .mockResolvedValue({ courseId: "c1", total: 1, passing: 1, rate: 100 });
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: /CS101/ })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /CS102/ }));
    await waitFor(() => {
      const urls = apiFetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("c2/analytics/pass-rate"))).toBe(true);
    });
  });
});