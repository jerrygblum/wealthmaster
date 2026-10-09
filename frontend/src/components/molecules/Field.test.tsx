import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Input } from "../atoms/Controls";
import { Field, FieldError } from "./Field";
it("preserves the label and error association without changing the control", () => {
  render(
    <Field label="Limit" htmlFor="limit">
      <Input id="limit" aria-invalid aria-describedby="limit-error" />
      <FieldError id="limit-error">Enter an amount</FieldError>
    </Field>,
  );
  expect(screen.getByLabelText("Limit")).toHaveAccessibleDescription("Enter an amount");
  expect(screen.getByLabelText("Limit")).toHaveAttribute("aria-invalid", "true");
});
