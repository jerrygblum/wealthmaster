import { expect, it } from "vitest";
import { displayAmount } from "./accountPresentation";

it.each([
  ["0", "0.00"],
  ["1", "1.00"],
  ["1.2", "1.20"],
  ["1.234", "1.23"],
  ["1.235", "1.24"],
  ["-1.235", "-1.24"],
  ["999.999", "1’000.00"],
  ["-0.004", "0.00"],
  ["-0.005", "-0.01"],
  ["99999999999999999999.994", "99’999’999’999’999’999’999.99"],
  ["99999999999999999999.995", "100’000’000’000’000’000’000.00"],
])("formats %s as %s with exact decimal rounding", (input, expected) => {
  expect(displayAmount(input)).toBe(expected);
});
