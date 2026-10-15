import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./Field.js";

describe("Field", () => {
  it("renders label linked by id", () => {
    render(
      <Field label="Email" htmlFor="email">
        <input id="email" />
      </Field>,
    );
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
  it("renders error when provided with role=alert", () => {
    render(
      <Field label="Email" htmlFor="email" error="Required">
        <input id="email" />
      </Field>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Required");
  });
  it("does not render error node when error is undefined", () => {
    render(
      <Field label="Email" htmlFor="email">
        <input id="email" />
      </Field>,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});