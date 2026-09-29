import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { GradesheetAdminPage } from "../pages/admin/GradesheetAdminPage.js";

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

describe("GradesheetAdminPage", () => {
  it("renders the four lifecycle buttons", () => {
    render(
      <MemoryRouter initialEntries={["/admin/gradesheets/b1/p1/s1"]}>
        <Routes>
          <Route path="/admin/gradesheets/:batchId/:programId/:semId" element={<GradesheetAdminPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Compile/)).toBeTruthy();
    expect(screen.getByText(/Lock/)).toBeTruthy();
    expect(screen.getByText(/Publish/)).toBeTruthy();
    expect(screen.getByText("Unlock")).toBeTruthy();
  });
});
