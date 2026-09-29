import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ResultsReviewPage } from "../pages/admin/ResultsReviewPage.js";

vi.mock("../lib/useResource.js", () => ({
  useResource: () => ({
    data: {
      data: [
        { id: "c1", code: "CS101", title: "Intro", semester: { id: "s1", number: 1, programId: "p1", batchId: "b1" } },
        { id: "c2", code: "CS102", title: "Data",  semester: { id: "s1", number: 1, programId: "p1", batchId: "b1" } },
      ],
    },
    loading: false,
    error: null,
    refetch: () => {},
  }),
}));

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

describe("ResultsReviewPage", () => {
  it("renders a row per course with Approve/Lock/Unlock buttons", () => {
    render(<MemoryRouter><ResultsReviewPage /></MemoryRouter>);
    expect(screen.getByText("CS101")).toBeTruthy();
    expect(screen.getByText("CS102")).toBeTruthy();
    expect(screen.getAllByText("Approve")).toHaveLength(2);
    expect(screen.getAllByText("Lock")).toHaveLength(2);
    expect(screen.getAllByText("Unlock")).toHaveLength(2);
  });
});