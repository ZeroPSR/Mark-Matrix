import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button.js";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });
  it("applies variant and size classnames", () => {
    render(<Button variant="secondary" size="lg">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/secondary/);
    expect(btn.className).toMatch(/lg/);
  });
  it("calls onClick when enabled", async () => {
    const fn = vi.fn();
    render(<Button onClick={fn}>x</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(fn).toHaveBeenCalledOnce();
  });
  it("does not call onClick when disabled", async () => {
    const fn = vi.fn();
    render(<Button disabled onClick={fn}>x</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(fn).not.toHaveBeenCalled();
  });
  it("renders as a button element by default", () => {
    render(<Button>x</Button>);
    expect(screen.getByRole("button").tagName).toBe("BUTTON");
  });
});