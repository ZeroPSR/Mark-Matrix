import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "./Header.js";

describe("Header", () => {
  it("renders wordmark, role badge, user name, sign out", () => {
    render(<Header role="admin" userName="Pranit" onSignOut={() => {}} onToggleTheme={() => {}} currentTheme="light" />);
    expect(screen.getByText("Mark-Matrix")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("Pranit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });
  it("renders no level-1 heading — the page title owns the page's only h1", () => {
    render(<Header role="admin" userName="Pranit" onSignOut={() => {}} onToggleTheme={() => {}} currentTheme="light" />);
    // The wordmark is a brand, not a heading: PageTitle renders the page's
    // single level-1 heading.
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByText("Mark-Matrix").tagName).toBe("P");
  });
  it("calls onSignOut when Sign out clicked", async () => {
    const fn = vi.fn();
    render(<Header role="admin" userName="Pranit" onSignOut={fn} onToggleTheme={() => {}} currentTheme="light" />);
    await userEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(fn).toHaveBeenCalledOnce();
  });
  it("calls onToggleTheme when toggle clicked", async () => {
    const fn = vi.fn();
    render(<Header role="admin" userName="Pranit" onSignOut={() => {}} onToggleTheme={fn} currentTheme="light" />);
    await userEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(fn).toHaveBeenCalledOnce();
  });
});
