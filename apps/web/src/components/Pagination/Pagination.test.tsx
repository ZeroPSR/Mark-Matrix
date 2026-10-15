import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./Pagination.js";

describe("Pagination", () => {
  it("shows page X of Y", () => {
    render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByText(/page 2 of 5/i)).toBeInTheDocument();
  });
  it("disables first/prev on page 1", () => {
    render(<Pagination page={1} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /first/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
  });
  it("disables next/last on last page", () => {
    render(<Pagination page={5} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /last/i })).toBeDisabled();
  });
  it("calls onPageChange(2) when Next clicked from page 1", async () => {
    const fn = vi.fn();
    render(<Pagination page={1} totalPages={5} onPageChange={fn} />);
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(fn).toHaveBeenCalledWith(2);
  });
});
