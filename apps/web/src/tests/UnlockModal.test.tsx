import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UnlockModal } from "../pages/admin/components/UnlockModal.js";

describe("UnlockModal", () => {
  it("disables the Unlock button until reason is non-empty", () => {
    render(<UnlockModal title="Confirm Unlock" onCancel={() => {}} onConfirm={() => {}} />);
    const btn = screen.getByText("Unlock");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("unlock reason"), { target: { value: "fix typo" } });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("trims whitespace — pure-whitespace reason still disabled", () => {
    render(<UnlockModal title="Confirm Unlock" onCancel={() => {}} onConfirm={() => {}} />);
    fireEvent.change(screen.getByLabelText("unlock reason"), { target: { value: "   " } });
    const btn = screen.getByText("Unlock");
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("passes the trimmed reason to onConfirm", async () => {
    const onConfirm = vi.fn();
    render(<UnlockModal title="Confirm Unlock" onCancel={() => {}} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText("unlock reason"), { target: { value: "  fix typo  " } });
    fireEvent.click(screen.getByText("Unlock"));
    expect(onConfirm).toHaveBeenCalledWith("fix typo");
  });
});