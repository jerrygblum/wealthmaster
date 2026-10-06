import { expect, it } from "vitest";
import { convertLimit } from "./limitPresentation";

it("converts units with exact string arithmetic and eight-place half-up division", () => {
  expect(convertLimit("100", "MONTH", "YEAR")).toBe("1200");
  expect(convertLimit("1200", "YEAR", "MONTH")).toBe("100");
  expect(convertLimit("100", "YEAR", "MONTH")).toBe("8.33333333");
  expect(convertLimit("0.00000006", "YEAR", "MONTH")).toBe("0.00000001");
  expect(convertLimit("99999999999999999999.12345678", "MONTH", "YEAR")).toBe(
    "1199999999999999999989.48148136",
  );
  expect(convertLimit("0", "MONTH", "YEAR")).toBe("0");
  expect(convertLimit("", "MONTH", "YEAR")).toBe("");
  expect(convertLimit("1e2", "MONTH", "YEAR")).toBe("");
});
