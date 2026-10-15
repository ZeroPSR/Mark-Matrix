import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkline } from "./Sparkline.js";
describe("Sparkline", () => {
  it("renders a polyline", () => {
    render(<Sparkline values={[1, 3, 2, 4]} ariaLabel="Trend" />);
    const svg = screen.getByRole("img", { name: "Trend" });
    expect(svg.querySelector("polyline")).toBeInTheDocument();
  });
});
