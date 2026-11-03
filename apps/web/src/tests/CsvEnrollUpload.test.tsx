import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { apiFetch } from "../lib/api.js";
import { CsvEnrollUpload } from "../pages/admin/components/CsvEnrollUpload.js";

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

beforeEach(() => {
  apiFetchMock.mockReset();
  apiFetchMock.mockResolvedValue({ enrolled: 2, errors: [] });
});

describe("CsvEnrollUpload", () => {
  it("parses and previews valid rows", async () => {
    render(<CsvEnrollUpload semId="sem-1" />);
    const file = new File(["roll_number\n23BCA001\n23BCA002\n"], "enroll.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/2 valid rows/)).toBeTruthy();
    });
  });

  it("reports a clean upload in a success banner", async () => {
    render(<CsvEnrollUpload semId="sem-1" />);
    const file = new File(["roll_number\n23BCA001\n23BCA002\n"], "enroll.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/2 valid rows/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/2 students enrolled/i);
    });
  });

  it("lists server errors inside a collapsible banner", async () => {
    apiFetchMock.mockResolvedValue({
      enrolled: 1,
      errors: [{ row: 3, reason: "validation_failed" }],
    });
    render(<CsvEnrollUpload semId="sem-1" />);
    const file = new File(["roll_number\n23BCA001\n23BCA002\n"], "enroll.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/2 valid rows/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/finished with errors/i);
    });
    const details = screen.getByText("Show error details").closest("details");
    expect(details).not.toBeNull();
    expect(within(details as HTMLElement).getByText(/validation_failed/)).toBeInTheDocument();
  });
});
