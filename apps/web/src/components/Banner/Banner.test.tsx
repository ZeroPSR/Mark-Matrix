// apps/web/src/components/Banner/Banner.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Banner } from "./Banner.js";
describe("Banner", () => {
  it("renders title and children", () => {
    render(<Banner variant="warning" title="Heads up">Migrate before Friday</Banner>);
    expect(screen.getByText("Heads up")).toBeInTheDocument();
    expect(screen.getByText("Migrate before Friday")).toBeInTheDocument();
  });
  it("uses role=alert for the error variant", () => {
    render(<Banner variant="error">Boom</Banner>);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
  it("uses role=status for the success variant", () => {
    render(<Banner variant="success">Saved</Banner>);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
