import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { UnlockModal, type UnlockModalProps } from "../pages/admin/components/UnlockModal.js";

function renderModal(overrides: Partial<UnlockModalProps> = {}): void {
  render(
    <UnlockModal
      open
      onClose={() => {}}
      onConfirm={() => {}}
      title="Unlock marks for CS101"
      {...overrides}
    />,
  );
}

function Harness(): JSX.Element {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open unlock</button>
      <UnlockModal
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => {}}
        title="Unlock marks for CS101"
      />
    </>
  );
}

describe("UnlockModal", () => {
  it("renders nothing when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Reason")).toBeNull();
  });

  it("renders the dialog with its title and the reason field", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Unlock record")).toBeInTheDocument();
    expect(screen.getByText("Unlock marks for CS101")).toBeInTheDocument();
    expect(screen.getByLabelText("Reason")).toBeInTheDocument();
  });

  it("disables the Unlock button until reason is non-empty", () => {
    renderModal();
    const btn = screen.getByRole("button", { name: "Unlock" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "fix typo" } });
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });

  it("trims whitespace — pure-whitespace reason still disabled", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "   " } });
    const btn = screen.getByRole("button", { name: "Unlock" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("passes the trimmed reason to onConfirm", async () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "  fix typo  " } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(onConfirm).toHaveBeenCalledWith("fix typo");
  });

  it("submits the trimmed reason when Enter is pressed in the reason field", async () => {
    const onConfirm = vi.fn();
    renderModal({ onConfirm });
    await userEvent.type(screen.getByLabelText("Reason"), "fix typo{Enter}");
    expect(onConfirm).toHaveBeenCalledWith("fix typo");
  });

  it("keeps the reason while open and clears it once the dialog is closed", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open unlock" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "fix typo" } });
    expect((screen.getByLabelText("Reason") as HTMLInputElement).value).toBe("fix typo");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open unlock" }));
    expect((screen.getByLabelText("Reason") as HTMLInputElement).value).toBe("");
  });
});
