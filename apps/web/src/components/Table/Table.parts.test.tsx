import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "./Table.js";

describe("Table parts", () => {
  it("composes into a real table with a head and body rows", () => {
    const { container } = render(
      <table>
        <TableHead>
          <TableHeaderCell>Roll</TableHeaderCell>
          <TableHeaderCell align="right">%</TableHeaderCell>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell mono>21</TableCell>
            <TableCell align="right">50%</TableCell>
          </TableRow>
        </TableBody>
      </table>,
    );
    expect(container.querySelector("thead")).toBeTruthy();
    expect(container.querySelector("tbody")).toBeTruthy();
    expect(container.querySelectorAll("tr")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: "Roll" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "%" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "21" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "50%" })).toBeInTheDocument();
  });

  it("applies the design-system right-alignment and mono classes", () => {
    render(
      <table>
        <TableHead>
          <TableHeaderCell align="right">%</TableHeaderCell>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell align="right" mono>50%</TableCell>
          </TableRow>
        </TableBody>
      </table>,
    );
    expect(screen.getByRole("columnheader", { name: "%" }).className).toMatch(/right/);
    const cell = screen.getByRole("cell", { name: "50%" });
    expect(cell.className).toMatch(/right/);
    expect(cell.className).toMatch(/mono/);
  });
});
