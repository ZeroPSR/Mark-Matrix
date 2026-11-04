// apps/web/src/components/KpiGrid/KpiGrid.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { KpiGrid } from "./KpiGrid.js";

describe("KpiGrid", () => {
  it("renders one labelled tile per item", () => {
    render(
      <KpiGrid
        label="Key figures"
        items={[
          { label: "Students", value: "30" },
          { label: "Pass rate", value: "83.33%" },
        ]}
      />,
    );
    const grid = screen.getByLabelText("Key figures");
    expect(grid.querySelectorAll("dt")).toHaveLength(2);
    expect(grid.querySelectorAll("dd")).toHaveLength(2);
    expect(within(grid).getByText("Students")).toBeInTheDocument();
    expect(within(grid).getByText("83.33%")).toBeInTheDocument();
  });

  it("renders an empty grid when there are no figures", () => {
    render(<KpiGrid label="Key figures" items={[]} />);
    const grid = screen.getByLabelText("Key figures");
    expect(grid.querySelectorAll("dt")).toHaveLength(0);
  });
});
