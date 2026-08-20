import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CsvEnrollUpload } from "../pages/admin/components/CsvEnrollUpload.js";

vi.mock("../lib/api.js", () => ({
  apiFetch: vi.fn().mockResolvedValue({ enrolled: 2, errors: [] }),
}));

describe("CsvEnrollUpload", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("parses and previews valid rows", async () => {
    render(<CsvEnrollUpload semId="sem-1" />);
    const file = new File(["roll_number\n23BCA001\n23BCA002\n"], "enroll.csv", { type: "text/csv" });
    const input = document.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByText(/2 valid rows/)).toBeTruthy();
    });
  });
});
