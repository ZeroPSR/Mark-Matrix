import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotFoundPage } from "../pages/NotFoundPage.js";
import { ForbiddenPage } from "../pages/ForbiddenPage.js";

describe("NotFoundPage", () => {
  it("renders its heading and message", () => {
    render(<NotFoundPage />);
    expect(screen.getByRole("heading", { name: "Not found" })).toBeInTheDocument();
    expect(
      screen.getByText("The page you were looking for doesn't exist."),
    ).toBeInTheDocument();
  });
});

describe("ForbiddenPage", () => {
  it("renders its heading and message", () => {
    render(<ForbiddenPage />);
    expect(screen.getByRole("heading", { name: "Forbidden" })).toBeInTheDocument();
    expect(
      screen.getByText("You don't have permission to view this page."),
    ).toBeInTheDocument();
  });
});
