// apps/web/src/components/Tabs/Tabs.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs } from "./Tabs.js";
describe("Tabs", () => {
  it("marks active tab with aria-selected=true", () => {
    render(
      <Tabs
        items={[{ id: "a", label: "A" }, { id: "b", label: "B" }]}
        activeId="a"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("tab", { name: "A" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "B" })).toHaveAttribute("aria-selected", "false");
  });
  it("calls onChange with clicked tab id", async () => {
    const fn = vi.fn();
    render(
      <Tabs
        items={[{ id: "a", label: "A" }, { id: "b", label: "B" }]}
        activeId="a"
        onChange={fn}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "B" }));
    expect(fn).toHaveBeenCalledWith("b");
  });
});
