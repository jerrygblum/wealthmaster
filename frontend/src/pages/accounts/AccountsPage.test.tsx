import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import { AccountsPage } from "./AccountsPage";
import type { FinancialAccount } from "../../types/models";

vi.mock("../../services/api", async (original) => ({
  ...(await original<typeof import("../../services/api")>()),
  api: { accounts: vi.fn(), reorderAccounts: vi.fn(), setAccountAccent: vi.fn() },
}));
const first: FinancialAccount = {
  id: "a",
  name: "Daily",
  type: "CHECKING",
  currency: "CHF",
  openingBalance: "20",
  openingDate: "2026-01-01",
  active: true,
  institution: null,
  createdAt: "",
  version: 0,
  hasActivity: true,
  accent: "DEFAULT",
};
const archived = { ...first, id: "c", name: "Old", active: false };
const second = { ...first, id: "b", name: "Savings" };
const props = { user: { id: "owner", email: "synthetic@example.test" }, onExpired: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks();
  window.location.hash = "#/accounts";
  vi.mocked(api.accounts).mockResolvedValue([first, archived, second]);
});
it("moves visible accounts while retaining archived slots and server versions", async () => {
  vi.mocked(api.reorderAccounts).mockResolvedValue([second, archived, first]);
  render(<AccountsPage {...props} />);
  expect(await screen.findByRole("button", { name: "Move Daily up" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Move Savings up" }));
  await waitFor(() => expect(api.reorderAccounts).toHaveBeenCalledWith([second, archived, first]));
  await screen.findByText("Savings moved up.");
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Savings");
  expect(screen.getByRole("button", { name: "Move Daily down" })).toBeDisabled();
});
it("saves color for used accounts and displays the saved accent", async () => {
  vi.mocked(api.setAccountAccent).mockResolvedValue({ ...first, accent: "TEAL", version: 1 });
  render(<AccountsPage {...props} />);
  fireEvent.change(await screen.findByRole("combobox", { name: "Color for Daily" }), {
    target: { value: "TEAL" },
  });
  await screen.findByText("Daily color updated.");
  expect(api.setAccountAccent).toHaveBeenCalledWith(first, "TEAL");
  expect(screen.getAllByRole("article")[0]).toHaveAttribute("data-accent", "TEAL");
});
it("preserves the displayed order on failure and offers reload for stale data", async () => {
  vi.mocked(api.reorderAccounts).mockRejectedValue(
    new ApiError(412, "Reload accounts and try again."),
  );
  render(<AccountsPage {...props} />);
  fireEvent.click(await screen.findByRole("button", { name: "Move Daily down" }));
  await screen.findByRole("alert");
  expect(screen.getAllByRole("article")[0]).toHaveTextContent("Daily");
  expect(screen.getByRole("button", { name: "Move Daily down" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Reload accounts" }));
  await waitFor(() => expect(api.accounts).toHaveBeenCalledTimes(2));
});
