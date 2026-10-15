import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Nav } from "./Nav.js";

describe("Nav", () => {
  it("renders links and marks the active one", () => {
    render(
      <MemoryRouter initialEntries={["/b"]}>
        <Nav items={[{ to: "/a", label: "Alpha" }, { to: "/b", label: "Beta" }]} />
      </MemoryRouter>,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(screen.getByText("Beta").getAttribute("aria-current")).toBe("page");
  });
});
