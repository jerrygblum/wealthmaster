import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../../services/api";
import type { Category } from "../../types/models";
import { CategoriesPage } from "./CategoriesPage";
vi.mock("../../services/api", async (original) => ({
  ...(await original<typeof import("../../services/api")>()),
  api: {
    preferences: vi.fn(),
    categories: vi.fn(),
    saveCategory: vi.fn(),
    setCategoryActive: vi.fn(),
    deleteCategory: vi.fn(),
    installCategoryStarters: vi.fn(),
    logout: vi.fn(),
  },
}));
const user = { id: "synthetic-user", email: "owner@example.test" };
const root: Category = {
  id: "root",
  name: "Synthetic Food",
  type: "SPENDING",
  parentId: null,
  active: true,
  available: true,
  createdAt: "2026-10-05T00:00:00Z",
  version: 0,
  hasActivity: false,
  hasChildren: true,
};
const child: Category = {
  ...root,
  id: "child",
  name: "Synthetic Groceries",
  parentId: "root",
  hasChildren: false,
  hasActivity: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.preferences).mockResolvedValue({
    defaultCurrency: "CHF",
    version: 1,
  });
  vi.mocked(api.categories).mockResolvedValue({ items: [], starterSetAvailable: true });
});
function renderPage(expired = vi.fn(), logout = vi.fn()) {
  render(<CategoriesPage user={user} onExpired={expired} onLogout={logout} />);
}
it("offers optional starters only for eligible empty lists", async () => {
  vi.mocked(api.installCategoryStarters).mockResolvedValue({
    items: [root],
    starterSetAvailable: false,
  });
  renderPage();
  await screen.findByText("Make categories your own");
  fireEvent.click(screen.getByText("Add starter categories"));
  await waitFor(() => expect(api.installCategoryStarters).toHaveBeenCalledOnce());
});
it("creates a child with parent and type and retains input after a failure", async () => {
  vi.mocked(api.categories).mockResolvedValue({ items: [root], starterSetAvailable: false });
  renderPage();
  await screen.findByText("Synthetic Food");
  fireEvent.click(screen.getByText("Create category"));
  fireEvent.change(screen.getByLabelText("Category name"), {
    target: { value: "Synthetic Groceries" },
  });
  fireEvent.change(screen.getByLabelText("Parent category (optional)"), {
    target: { value: "root" },
  });
  vi.mocked(api.saveCategory).mockRejectedValue(new ApiError(409, "Duplicate category"));
  fireEvent.click(screen.getByText("Save category"));
  await screen.findByText("Duplicate category");
  expect(api.saveCategory).toHaveBeenCalledWith(
    { name: "Synthetic Groceries", type: "SPENDING", parentId: "root" },
    undefined,
  );
  expect(screen.getByLabelText("Category name")).toHaveValue("Synthetic Groceries");
});
it("locks used hierarchy and unused parents with children, preserving stale edits", async () => {
  vi.mocked(api.categories).mockResolvedValue({ items: [root, child], starterSetAvailable: false });
  renderPage();
  await screen.findByText("Synthetic Food → Synthetic Groceries");
  fireEvent.click(screen.getAllByRole("button", { name: "Edit category" })[1]);
  expect(screen.getByLabelText("Category type")).toBeDisabled();
  expect(screen.getByLabelText("Parent category (optional)")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Category name"), {
    target: { value: "Synthetic Shopping" },
  });
  vi.mocked(api.saveCategory).mockRejectedValue(new ApiError(412, "Category changed"));
  fireEvent.click(screen.getByText("Save category"));
  await screen.findByText("Category changed");
  expect(screen.getByText("Save category")).toBeDisabled();
  expect(screen.getByLabelText("Category name")).toHaveValue("Synthetic Shopping");
  fireEvent.click(screen.getByText("Cancel"));
  await screen.findByText("Synthetic Food → Synthetic Groceries");
  fireEvent.click(screen.getAllByRole("button", { name: "Edit category" })[0]);
  expect(screen.getByLabelText("Category type")).toBeDisabled();
});
it("shows children of archived parents in the archived view without changing child status", async () => {
  vi.mocked(api.categories).mockResolvedValue({
    items: [
      { ...root, active: false, available: false },
      { ...child, available: false },
    ],
    starterSetAvailable: false,
  });
  renderPage();
  await screen.findByText("No active spending categories.");
  fireEvent.click(screen.getByText("Archived categories"));
  await screen.findByText("Unavailable while parent is archived");
  expect(
    screen
      .getAllByRole("button", { name: "Delete" })
      .every((button) => button.hasAttribute("disabled")),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() =>
    expect(api.setCategoryActive).toHaveBeenCalledWith(
      expect.objectContaining({ id: "root" }),
      true,
    ),
  );
});
it("confirms deletion of unused categories", async () => {
  const unused = { ...root, hasChildren: false };
  vi.mocked(api.categories).mockResolvedValue({ items: [unused], starterSetAvailable: false });
  renderPage();
  await screen.findByText("Synthetic Food");
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await screen.findByText("Delete Synthetic Food?");
  expect(api.deleteCategory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Confirm deletion"));
  await waitFor(() => expect(api.deleteCategory).toHaveBeenCalledWith(unused));
});
it("retries failed loads and routes expired sessions to sign-in", async () => {
  const expired = vi.fn();
  vi.mocked(api.categories)
    .mockRejectedValueOnce(new ApiError(0, "Disconnected"))
    .mockRejectedValueOnce(new ApiError(401, "Expired"));
  renderPage(expired);
  await screen.findByText("Disconnected");
  fireEvent.click(screen.getByText("Retry / reload categories"));
  await waitFor(() => expect(expired).toHaveBeenCalledOnce());
});

it("retains failed category input while other actions stay disabled", async () => {
  vi.mocked(api.categories).mockResolvedValue({ items: [root], starterSetAvailable: false });
  vi.mocked(api.saveCategory).mockRejectedValue(new ApiError(409, "Synthetic category rejected"));
  renderPage();
  await screen.findByText("Synthetic Food");
  fireEvent.click(screen.getByRole("button", { name: "Edit category" }));
  fireEvent.change(screen.getByLabelText("Category name"), {
    target: { value: "Synthetic Shopping" },
  });
  fireEvent.click(screen.getByText("Save category"));
  await screen.findByText("Synthetic category rejected");
  expect(screen.getByLabelText("Category name")).toHaveValue("Synthetic Shopping");
  expect(screen.getByText("Archived categories")).toBeDisabled();
  expect(api.saveCategory).toHaveBeenCalledWith(
    { name: "Synthetic Shopping", type: "SPENDING", parentId: null },
    root,
  );
});

it("category management does not load preferences or expose limit controls", async () => {
  vi.mocked(api.categories).mockResolvedValue({ items: [root], starterSetAvailable: false });
  renderPage();
  await screen.findByText("Synthetic Food");
  expect(api.preferences).not.toHaveBeenCalled();
  expect(screen.queryByText("Spending limit")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create category" }));
  expect(screen.queryByLabelText("Spending limit")).toBeNull();
});
