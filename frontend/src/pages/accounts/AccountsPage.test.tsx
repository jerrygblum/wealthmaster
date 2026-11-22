import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import { AccountsPage } from "./AccountsPage";
import { prepareAccountLogo } from "../../utils/accountVisuals";
import type { FinancialAccount } from "../../types/models";
vi.mock("../../services/api", async (original) => ({
  ...(await original<typeof import("../../services/api")>()),
  api: { accounts: vi.fn(), reorderAccounts: vi.fn(), setAccountAppearance: vi.fn() },
}));
vi.mock("../../utils/accountVisuals", async (original) => ({
  ...(await original<typeof import("../../utils/accountVisuals")>()),
  prepareAccountLogo: vi.fn(),
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
const second = { ...first, id: "b", name: "Savings", type: "SAVINGS" as const };
const props = { user: { id: "owner", email: "synthetic@example.test" }, onExpired: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks();
  window.location.hash = "#/accounts";
  vi.mocked(api.accounts).mockResolvedValue([first, archived, second]);
});
async function openSettings() {
  fireEvent.click(await screen.findByRole("button", { name: "Card settings" }));
  return screen.findByRole("dialog", { name: "Account card settings" });
}
it("moves all accounts including archived accounts in a separate modal", async () => {
  vi.mocked(api.reorderAccounts).mockResolvedValue([first, second, archived]);
  render(<AccountsPage {...props} />);
  await screen.findByRole("button", { name: "View details for Daily" });
  expect(screen.queryByRole("button", { name: "Move Daily up" })).not.toBeInTheDocument();
  const dialog = await openSettings();
  expect(within(dialog).getByText(/Archived/)).toBeVisible();
  expect(within(dialog).getByRole("button", { name: "Move Daily up" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Move Savings up" }));
  await waitFor(() => expect(api.reorderAccounts).toHaveBeenCalledWith([first, second, archived]));
  await within(dialog).findByText("Savings moved up.");
  expect(within(dialog).getAllByRole("listitem")[1]).toHaveTextContent("Savings");
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("saves any hex color and a bank mark with a full-card tint", async () => {
  vi.mocked(api.setAccountAppearance).mockResolvedValue({
    ...first,
    color: "#15ab63",
    logo: "UBS",
    version: 1,
  });
  render(<AccountsPage {...props} />);
  const dialog = await openSettings();
  fireEvent.change(within(dialog).getByLabelText("Hex color for Daily"), {
    target: { value: "#15ab63" },
  });
  fireEvent.change(within(dialog).getByRole("combobox", { name: "Bank mark for Daily" }), {
    target: { value: "UBS" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save appearance for Daily" }));
  await within(dialog).findByText("Daily appearance saved.");
  expect(api.setAccountAppearance).toHaveBeenCalledWith(first, {
    color: "#15ab63",
    logo: "UBS",
    logoData: null,
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  expect(screen.getAllByRole("article")[0].style.getPropertyValue("--account-color")).toBe(
    "#15ab63",
  );
  expect(screen.getByRole("img", { name: "UBS bank mark" })).toBeVisible();
});
it("shows stale failures inside the modal and offers reload without changing saved order", async () => {
  vi.mocked(api.reorderAccounts).mockRejectedValue(
    new ApiError(412, "Reload accounts and try again."),
  );
  render(<AccountsPage {...props} />);
  const dialog = await openSettings();
  fireEvent.click(within(dialog).getByRole("button", { name: "Move Daily down" }));
  await within(dialog).findByRole("alert");
  expect(within(dialog).getByRole("button", { name: "Move Daily down" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "Reload accounts" }));
  await waitFor(() => expect(api.accounts).toHaveBeenCalledTimes(2));
  expect(within(dialog).getAllByRole("listitem")[0]).toHaveTextContent("Daily");
});
it("prepares custom images, persists them on save and falls back if an image fails", async () => {
  const data = "data:image/png;base64,synthetic";
  vi.mocked(prepareAccountLogo).mockResolvedValue(data);
  vi.mocked(api.setAccountAppearance).mockResolvedValue({
    ...first,
    logo: "CUSTOM",
    logoData: data,
  });
  render(<AccountsPage {...props} />);
  const dialog = await openSettings();
  fireEvent.change(within(dialog).getByLabelText("Upload logo for Daily"), {
    target: { files: [new File(["synthetic"], "bank.png", { type: "image/png" })] },
  });
  await waitFor(() =>
    expect(within(dialog).getByRole("button", { name: "Save appearance for Daily" })).toBeEnabled(),
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "Save appearance for Daily" }));
  await within(dialog).findByText("Daily appearance saved.");
  expect(api.setAccountAppearance).toHaveBeenCalledWith(first, {
    color: "#64748b",
    logo: "CUSTOM",
    logoData: data,
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  const card = screen.getAllByRole("article")[0];
  fireEvent.error(within(card).getByAltText("Custom account logo"));
  expect(within(card).getByRole("img", { name: "Checking account icon" })).toBeVisible();
});
it("hides custom uploads in the demo but keeps the built-in marks", async () => {
  render(<AccountsPage {...props} demo />);
  const dialog = await openSettings();
  expect(within(dialog).getByText(/Custom image uploads are unavailable/)).toBeVisible();
  expect(within(dialog).queryByLabelText("Upload logo for Daily")).not.toBeInTheDocument();
  expect(within(dialog).getByRole("combobox", { name: "Bank mark for Daily" })).toBeVisible();
});
it("shows upload failures and discards unsaved appearance edits on close", async () => {
  vi.mocked(prepareAccountLogo).mockRejectedValue(new Error("Choose a smaller image."));
  render(<AccountsPage {...props} />);
  let dialog = await openSettings();
  fireEvent.change(within(dialog).getByLabelText("Upload logo for Daily"), {
    target: { files: [new File(["synthetic"], "bank.png", { type: "image/png" })] },
  });
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("Choose a smaller image.");
  fireEvent.change(within(dialog).getByLabelText("Hex color for Daily"), {
    target: { value: "#ff0000" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Done" }));
  dialog = await openSettings();
  expect(within(dialog).getByLabelText("Hex color for Daily")).toHaveValue("#64748b");
  expect(api.setAccountAppearance).not.toHaveBeenCalled();
});
