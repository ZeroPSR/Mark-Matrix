import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudentPlaceholder } from "../pages/student/StudentPlaceholder.js";

describe("StudentPlaceholder", () => {
  it("renders the results heading and the placeholder message", () => {
    render(<StudentPlaceholder />);

    expect(screen.getByRole("heading", { level: 1, name: "My Results" })).toBeInTheDocument();
    expect(screen.getByText("Student results view (Cycle 5+).")).toBeInTheDocument();
  });

  it("renders inside the app shell without adding a nested main landmark", () => {
    const { container } = render(<StudentPlaceholder />);

    expect(container.querySelector("article")).toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });
});
