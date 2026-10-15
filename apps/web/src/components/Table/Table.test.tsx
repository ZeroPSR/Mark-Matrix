import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Table } from "./Table.js";

describe("Table", () => {
  it("renders headers and rows", () => {
    render(
      <Table
        columns={[
          { key: "name", header: "Name" },
          { key: "n",    header: "Score", align: "right", mono: true },
        ]}
        rows={[{ name: "Alice", n: 92 }, { name: "Bob", n: 75 }]}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Score" })).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
  });
  it("renders the empty message when rows is empty", () => {
    render(<Table columns={[{ key: "x", header: "X" }]} rows={[]} emptyMessage="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
  it("em-dash for null values", () => {
    render(<Table columns={[{ key: "x", header: "X" }]} rows={[{ x: null }]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
