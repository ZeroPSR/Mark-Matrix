// apps/web/src/components/Tooltip/Tooltip.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tooltip } from "./Tooltip.js";

describe("Tooltip", () => {
  it("shows tooltip on hover", async () => {
    render(
      <Tooltip content="Hi there">
        <button>x</button>
      </Tooltip>,
    );
    await userEvent.hover(screen.getByRole("button"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Hi there");
  });
});
