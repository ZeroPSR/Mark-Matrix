import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Loading } from "./Loading.js";
it("renders the loading text", () => {
  render(<Loading />);
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
