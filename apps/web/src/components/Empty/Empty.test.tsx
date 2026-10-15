import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Empty } from "./Empty.js";
it("renders the message", () => {
  render(<Empty>Nothing yet</Empty>);
  expect(screen.getByText("Nothing yet")).toBeInTheDocument();
});
