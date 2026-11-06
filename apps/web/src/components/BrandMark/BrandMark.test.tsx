import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandMark } from "./BrandMark.js";

describe("BrandMark", () => {
  it("renders the mark on its chip", () => {
    const { container } = render(<BrandMark size={48} />);
    const chip = container.firstElementChild;
    expect(chip).not.toBeNull();
    // The chip is sized by the size prop, and the mark fills it.
    expect(chip?.getAttribute("style")).toContain("--brand-mark-size: 48px");
    const img = screen.getByRole("presentation");
    expect(img).toHaveAttribute("src", expect.stringContaining("MarkMatrixMark"));
  });

  it("is decorative beside the wordmark, which names the product", () => {
    render(<BrandMark />);
    // No accessible name: the surrounding wordmark already names it, and an
    // empty alt is what keeps it from being announced twice.
    expect(screen.getByRole("presentation")).toHaveAttribute("alt", "");
  });

  it("can carry its own accessible name", () => {
    render(<BrandMark label="Mark-Matrix" />);
    expect(screen.getByRole("img", { name: "Mark-Matrix" })).toBeInTheDocument();
  });
});
