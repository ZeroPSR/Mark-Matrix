import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorState } from "./ErrorState.js";
it("renders the message and Retry button", () => {
  render(<ErrorState onRetry={() => {}}>Boom</ErrorState>);
  expect(screen.getByRole("alert")).toHaveTextContent("Boom");
  expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
});
it("calls onRetry when clicked", async () => {
  const fn = vi.fn();
  render(<ErrorState onRetry={fn}>Boom</ErrorState>);
  await userEvent.click(screen.getByRole("button", { name: /retry/i }));
  expect(fn).toHaveBeenCalledOnce();
});
