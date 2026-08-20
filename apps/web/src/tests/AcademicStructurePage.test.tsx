import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AcademicStructurePage } from "../pages/admin/AcademicStructurePage.js";

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockResolvedValue({ data: [] }),
}));

describe("AcademicStructurePage", () => {
  it("renders the four-column layout with empty lists", () => {
    render(<AcademicStructurePage />);
    expect(screen.getByText("Batches")).toBeTruthy();
    expect(screen.getByText("Programs")).toBeTruthy();
    expect(screen.getByText("Semesters")).toBeTruthy();
    expect(screen.getByText("Courses")).toBeTruthy();
  });
});
