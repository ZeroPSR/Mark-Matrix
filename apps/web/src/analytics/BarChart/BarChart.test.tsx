import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarChart } from "./BarChart.js";

describe("BarChart", () => {
  it("renders one rect per data point", () => {
    render(<BarChart data={[{ label: "A", value: 1 }, { label: "B", value: 3 }]} ariaLabel="Bars" />);
    const svg = screen.getByRole("img", { name: "Bars" });
    expect(svg.querySelectorAll("rect")).toHaveLength(2);
  });
  it("renders sr-only data table", () => {
    render(<BarChart data={[{ label: "A", value: 1 }, { label: "B", value: 3 }]} ariaLabel="Bars" />);
    const table = screen.getByRole("table", { hidden: true });
    expect(table).toBeInTheDocument();
  });
});
