import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DotPlot } from "./DotPlot.js";
describe("DotPlot", () => {
  it("renders one circle per value", () => {
    render(<DotPlot values={[1, 2, 3]} ariaLabel="Dots" />);
    const svg = screen.getByRole("img", { name: "Dots" });
    expect(svg.querySelectorAll("circle")).toHaveLength(3);
  });
});
