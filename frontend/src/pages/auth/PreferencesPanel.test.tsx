import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import { PreferencesPanel } from "./PreferencesPanel";
vi.mock("../../services/api", async (original) => ({
  ...(await original<typeof import("../../services/api")>()),
  api: { preferences: vi.fn(), savePreferences: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.preferences).mockResolvedValue({
    defaultCurrency: null,
    version: 0,
    hasLimitsToReset: false,
  });
});
it("requires an explicit currency and saves the preference version", async () => {
  render(<PreferencesPanel onExpired={vi.fn()} />);
  const input = await screen.findByLabelText("Default currency (ISO code)");
  expect(input).toHaveValue("");
  fireEvent.change(input, { target: { value: "chf" } });
  vi.mocked(api.savePreferences).mockResolvedValue({
    defaultCurrency: "CHF",
    version: 1,
    hasLimitsToReset: false,
  });
  fireEvent.click(screen.getByText("Save default currency"));
  await screen.findByText("Default currency saved. Enter spending limits in Categories.");
  expect(api.savePreferences).toHaveBeenCalledWith({
    defaultCurrency: "CHF",
    expectedVersion: 0,
    confirmLimitReset: false,
  });
});
it("warns, supports cancellation and confirms the reset explicitly", async () => {
  vi.mocked(api.preferences).mockResolvedValue({
    defaultCurrency: "CHF",
    version: 2,
    hasLimitsToReset: true,
  });
  render(<PreferencesPanel onExpired={vi.fn()} />);
  const input = await screen.findByLabelText("Default currency (ISO code)");
  fireEvent.change(input, { target: { value: "EUR" } });
  fireEvent.click(screen.getByText("Save default currency"));
  expect(api.savePreferences).not.toHaveBeenCalled();
  await screen.findByText(/You must enter your spending limits again/);
  fireEvent.click(screen.getByText("Cancel currency change"));
  expect(input).toHaveValue("CHF");
  expect(api.savePreferences).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "EUR" } });
  fireEvent.click(screen.getByText("Save default currency"));
  vi.mocked(api.savePreferences).mockResolvedValue({
    defaultCurrency: "EUR",
    version: 3,
    hasLimitsToReset: false,
  });
  fireEvent.click(screen.getByText("Confirm currency change"));
  await waitFor(() =>
    expect(api.savePreferences).toHaveBeenCalledWith({
      defaultCurrency: "EUR",
      expectedVersion: 2,
      confirmLimitReset: true,
    }),
  );
});
it("retains stale input and requires reload; handles session expiry", async () => {
  const expired = vi.fn();
  render(<PreferencesPanel onExpired={expired} />);
  const input = await screen.findByLabelText("Default currency (ISO code)");
  fireEvent.change(input, { target: { value: "EUR" } });
  vi.mocked(api.savePreferences).mockRejectedValue(new ApiError(412, "Currency changed"));
  fireEvent.click(screen.getByText("Save default currency"));
  await screen.findByText("Currency changed");
  expect(input).toHaveValue("EUR");
  expect(screen.getByText("Save default currency")).toBeDisabled();
  vi.mocked(api.preferences).mockRejectedValue(new ApiError(401, "Expired"));
  fireEvent.click(screen.getByText("Reload currency settings"));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});
