import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { File as FilePicker } from "./File.js";

describe("File", () => {
  it("renders the label and a file picker", () => {
    render(<FilePicker label="Upload" onChange={() => {}} />);
    expect(screen.getByText(/upload/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload/i)).toBeInTheDocument();
  });
  it("calls onChange with a File when a file is chosen", async () => {
    const fn = vi.fn();
    render(<FilePicker label="Upload" onChange={fn} />);
    const input = screen.getByLabelText(/upload/i);
    const csv = new window.File(["x"], "a.csv", { type: "text/csv" });
    await userEvent.upload(input, csv);
    expect(fn).toHaveBeenCalled();
    expect(screen.getByText("a.csv")).toBeInTheDocument();
  });
  it("Remove button clears the chosen filename", async () => {
    render(<FilePicker label="Upload" onChange={() => {}} />);
    const input = screen.getByLabelText(/upload/i);
    await userEvent.upload(input, new window.File(["x"], "a.csv", { type: "text/csv" }));
    await userEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(screen.queryByText("a.csv")).toBeNull();
  });
});
