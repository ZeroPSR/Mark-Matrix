import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Select } from "./Select.js";

describe("Select", () => {
  it("renders options", () => {
    render(
      <Select aria-label="x" options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]} />,
    );
    expect(screen.getByRole("option", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Beta" })).toBeInTheDocument();
  });
  it("calls onChange when an option is chosen", async () => {
    const fn = vi.fn();
    render(
      <Select aria-label="x" onChange={fn} options={[{ value: "a", label: "Alpha" }, { value: "b", label: "Beta" }]} />,
    );
    await userEvent.selectOptions(screen.getByLabelText("x"), "b");
    expect(fn).toHaveBeenCalled();
  });
});
