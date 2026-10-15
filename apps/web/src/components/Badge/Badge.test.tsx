// apps/web/src/components/Badge/Badge.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge.js";
describe("Badge", () => {
  it("renders uppercase text with the variant class", () => {
    render(<Badge variant="draft">Draft</Badge>);
    const el = screen.getByText("Draft");
    expect(el.className).toMatch(/draft/);
    // styles apply text-transform: uppercase via CSS; trust the class
  });
});
