import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { MyGradesheetPage } from "../pages/student/MyGradesheetPage.js";

// vi.mock is hoisted above all imports, so the factory cannot close over
// module-level lets. vi.hoisted shares mutable state with the hoisted
// factory without violating that constraint.
const mockState = vi.hoisted(() => ({
  result: {
    data: null as unknown,
    loading: false,
    error: null as string | null,
    refetch: () => {},
  },
}));

vi.mock("../lib/useResource.js", () => ({
  useResource: () => mockState.result,
}));

describe("MyGradesheetPage", () => {
  it("renders SGPA when the gradesheet is published", () => {
    mockState.result = {
      data: {
        data: {
          id: "g1",
          semId: "s1",
          studentId: "u1",
          status: "published",
          sgpa: 8.5,
          totalCredits: 16,
          courseCount: 4,
          compiledAt: null,
          compiledBy: null,
          lockedBy: null,
          lockedAt: null,
          publishedBy: null,
          publishedAt: "2026-09-29T00:00:00Z",
          unlockReason: null,
          unlockedBy: null,
          unlockedAt: null,
        },
      },
      loading: false,
      error: null,
      refetch: () => {},
    };
    render(
      <MemoryRouter initialEntries={["/student/gradesheets/b1/p1/s1"]}>
        <Routes>
          <Route
            path="/student/gradesheets/:batchId/:programId/:semId"
            element={<MyGradesheetPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/SGPA/)).toBeTruthy();
  });

  it("renders the 'not available' message when not published", () => {
    mockState.result = {
      data: null,
      loading: false,
      error: "not_found",
      refetch: () => {},
    };
    render(
      <MemoryRouter initialEntries={["/student/gradesheets/b1/p1/s1"]}>
        <Routes>
          <Route
            path="/student/gradesheets/:batchId/:programId/:semId"
            element={<MyGradesheetPage />}
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Gradesheet not available yet/)).toBeTruthy();
  });
});
