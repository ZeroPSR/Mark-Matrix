// apps/web/src/components/Modal/Modal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Modal } from "./Modal.js";

function Harness(): JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button onClick={() => setOpen(true)}>open</button>
      <Modal open={open} onClose={() => setOpen(false)} title="T">
        <button>A</button>
        <button>B</button>
      </Modal>
    </div>
  );
}

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(<Modal open={false} onClose={() => {}}>x</Modal>);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("renders dialog when open", () => {
    render(<Modal open onClose={() => {}} title="Hello">body</Modal>);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
  it("calls onClose on Escape", async () => {
    const fn = vi.fn();
    render(<Modal open onClose={fn} title="T">body</Modal>);
    await userEvent.keyboard("{Escape}");
    expect(fn).toHaveBeenCalledOnce();
  });
  it("calls onClose on backdrop click", () => {
    const fn = vi.fn();
    render(<Modal open onClose={fn} title="T">body</Modal>);
    fireEvent.mouseDown(screen.getByTestId("modal-backdrop"));
    expect(fn).toHaveBeenCalledOnce();
  });
  it("Review Focus: focus is trapped inside the dialog", async () => {
    render(<Harness />);
    const dialog = screen.getByRole("dialog");
    const a = screen.getByRole("button", { name: "A" });
    const b = screen.getByRole("button", { name: "B" });
    // Focus initial: first focusable in the dialog
    expect(document.activeElement).toBe(a);
    // Tab past last → cycles back to first
    b.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(a);
    // Shift+Tab from first → cycles to last
    a.focus();
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(b);
    // Sanity: focus never escapes dialog
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
