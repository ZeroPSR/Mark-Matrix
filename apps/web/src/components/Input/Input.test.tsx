import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input.js";

describe("Input", () => {
  it("renders with type=text by default", () => {
    render(<Input aria-label="x" />);
    expect(screen.getByLabelText("x")).toHaveAttribute("type", "text");
  });
  it("renders with type=number and applies mono class", () => {
    render(<Input aria-label="x" type="number" />);
    const el = screen.getByLabelText("x");
    expect(el).toHaveAttribute("type", "number");
    expect(el.className).toMatch(/mono/);
  });
  it("forwards value and onChange", async () => {
    const fn = vi.fn();
    render(<Input aria-label="x" value="a" onChange={fn} />);
    const el = screen.getByLabelText("x");
    await userEvent.type(el, "y");
    expect(fn).toHaveBeenCalled();
  });
});
