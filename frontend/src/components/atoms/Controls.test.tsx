import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { expect, it, vi } from "vitest";
import { Button, Checkbox, Input, Link, Radio, Select } from "./Controls";
it("preserves native disabled button behavior and secondary styling", () => {
  const click = vi.fn();
  render(
    <Button variant="secondary" disabled onClick={click}>
      Save
    </Button>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(click).not.toHaveBeenCalled();
  expect(screen.getByRole("button")).toHaveClass("secondary");
});
it("forwards native input attributes and refs and focuses newly opened forms", () => {
  const ref = createRef<HTMLInputElement>();
  render(<Input ref={ref} aria-label="Amount" required focusOnMount inputMode="decimal" />);
  expect(ref.current).toBe(screen.getByRole("textbox"));
  expect(ref.current).toHaveFocus();
  expect(ref.current).toBeRequired();
});
it("retains accessible native links, selection and checked states", () => {
  render(
    <>
      <Link href="#/accounts">Accounts</Link>
      <Checkbox aria-label="Show all" defaultChecked />
      <Radio aria-label="Only this period" defaultChecked />
      <Select aria-label="Period" defaultValue="month">
        <option value="month">Month</option>
      </Select>
    </>,
  );
  expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute("href", "#/accounts");
  expect(screen.getByRole("checkbox")).toBeChecked();
  expect(screen.getByRole("radio")).toBeChecked();
  expect(screen.getByRole("combobox")).toHaveValue("month");
});
