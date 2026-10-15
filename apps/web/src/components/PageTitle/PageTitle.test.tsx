import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageTitle } from "./PageTitle.js";
describe("PageTitle", () => {
  it("renders eyebrow, title, and subtitle", () => {
    render(<PageTitle eyebrow="Student · Gradesheet" subtitle="Semester 3">My Gradesheet</PageTitle>);
    expect(screen.getByText("Student · Gradesheet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "My Gradesheet" })).toBeInTheDocument();
    expect(screen.getByText("Semester 3")).toBeInTheDocument();
  });
});
