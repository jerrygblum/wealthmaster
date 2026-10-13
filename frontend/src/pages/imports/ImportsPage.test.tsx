import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "../../services/api";
import type { ImportBatch, ImportPreview } from "../../types/imports";
import { ImportsPage } from "./ImportsPage";

vi.mock("../../services/api", async (original) => ({
  ...(await original<typeof import("../../services/api")>()),
  api: {
    imports: vi.fn(),
    accounts: vi.fn(),
    categories: vi.fn(),
    importBatch: vi.fn(),
    deleteImportDraft: vi.fn(),
    uploadWorkbook: vi.fn(),
    configureImport: vi.fn(),
    saveImport: vi.fn(),
    previewImport: vi.fn(),
    commitImport: vi.fn(),
    previewImportUndo: vi.fn(),
    undoImport: vi.fn(),
    purgeImportSource: vi.fn(),
  },
}));

const plan = {
  selection: {
    sheet: "Synthetic",
    headerRow: 1,
    columns: {
      date: "A",
      kind: "C",
      account: "D",
      description: "E",
      amount: "F",
      balance: "G",
      category: "H",
      card: "I",
      cardText: "J",
    },
  },
  start: "2024-01-01",
  end: "2024-01-31",
  accounts: [
    {
      key: "bank",
      existingId: "account-1",
      version: 0,
      create: null,
      closingBalance: "920",
    },
    {
      key: "card",
      existingId: null,
      version: null,
      closingBalance: "0",
      create: {
        name: "Synthetic Visa",
        type: "CREDIT_CARD" as const,
        institution: "",
        currency: "CHF",
        openingAmount: "0",
        openingDate: "2024-01-01",
        balanceMeaning: "AMOUNT_OWED" as const,
      },
    },
  ],
  categories: [],
  rows: [
    {
      row: 2,
      include: true,
      reason: "",
      date: "2024-01-05",
      kind: "Expense",
      account: "bank",
      card: "card",
      category: "NONE",
      amount: "80",
      description: "Synthetic purchase",
      partner: null,
    },
  ],
  duplicates: {},
};
const batch: ImportBatch = {
  id: "batch-1",
  status: "DRAFT",
  version: 2,
  createdAt: "2026-10-12T10:00:00Z",
  workbook: {
    date1904: false,
    sheets: [
      {
        name: "Synthetic",
        rows: [
          { number: 1, cells: { A: { value: "Date", formula: "", type: "str" } } },
          {
            number: 2,
            cells: {
              A: { value: "2024-01-05", formula: "", type: "str" },
              C: { value: "Expense", formula: "", type: "str" },
              D: { value: "Bank", formula: "", type: "str" },
              E: { value: "Synthetic purchase", formula: "", type: "str" },
              F: { value: "80", formula: "", type: "str" },
              G: { value: "-80", formula: "", type: "str" },
              H: { value: "Food", formula: "", type: "str" },
              I: { value: "Visa", formula: "", type: "str" },
              J: { value: "Synthetic card text", formula: "", type: "str" },
            },
          },
        ],
      },
    ],
  },
  plan,
  receipt: null,
};
const preview: ImportPreview = {
  version: 2,
  token: "preview-token",
  errors: [],
  warnings: ["Synthetic Visa: no independently verified closing balance."],
  operations: [
    {
      key: "row:2",
      kind: "EXPENSE",
      account: "card",
      destination: null,
      category: null,
      amount: "80",
      currency: "CHF",
      date: "2024-01-05",
      description: "Synthetic purchase",
      reconstructed: false,
      rows: [2],
    },
    {
      key: "settlement:2024-01:bank:card:CHF",
      kind: "TRANSFER",
      account: "bank",
      destination: "card",
      category: null,
      amount: "80",
      currency: "CHF",
      date: "2024-01-05",
      description: "Legacy card settlement (reconstructed)",
      reconstructed: true,
      rows: [2],
    },
  ],
  duplicates: { "row:2": [], "settlement:2024-01:bank:card:CHF": [] },
  balances: [
    {
      key: "bank",
      name: "Synthetic Bank",
      currency: "CHF",
      opening: "1000",
      existingMovements: "0",
      importedMovements: "-80",
      projectedClosing: "920",
      expectedClosing: "920",
      difference: "0",
    },
  ],
  totals: { "CHF EXPENSE": "80", "CHF TRANSFER": "80" },
  excluded: [],
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.imports).mockResolvedValue([
    { id: batch.id, status: batch.status, version: batch.version, createdAt: batch.createdAt },
  ]);
  vi.mocked(api.accounts).mockResolvedValue([
    {
      id: "account-1",
      name: "Synthetic Bank",
      type: "CHECKING",
      institution: null,
      currency: "CHF",
      openingBalance: "1000",
      openingDate: "2024-01-01",
      active: true,
      createdAt: "",
      version: 0,
      hasActivity: false,
    },
  ]);
  vi.mocked(api.categories).mockResolvedValue({ items: [], starterSetAvailable: true });
  vi.mocked(api.importBatch).mockResolvedValue(batch);
  vi.mocked(api.deleteImportDraft).mockResolvedValue(undefined);
  vi.mocked(api.saveImport).mockResolvedValue(batch);
  vi.mocked(api.previewImport).mockResolvedValue(preview);
  vi.mocked(api.commitImport).mockResolvedValue({
    batchId: batch.id,
    createdOperations: 2,
    linkedOperations: 0,
    createdAccounts: { card: "card-1" },
    createdCategories: {},
    committedAt: "2026-10-12T10:30:00Z",
  });
});

it("uploads privately and does not create financial resources while staging", async () => {
  vi.mocked(api.uploadWorkbook).mockResolvedValue({ ...batch, plan: null, version: 0 });
  render(<ImportsPage onExpired={() => {}} />);
  const file = new File(["synthetic"], "synthetic.xlsm", {
    type: "application/vnd.ms-excel.sheet.macroEnabled.12",
  });
  fireEvent.change(await screen.findByLabelText(/Workbook/), { target: { files: [file] } });
  await screen.findByRole("heading", { name: "Choose source columns" });
  expect(api.uploadWorkbook).toHaveBeenCalledWith(file);
  expect(api.saveImport).not.toHaveBeenCalled();
  expect(api.commitImport).not.toHaveBeenCalled();
  expect(screen.getByText(/Macros are never executed/)).toBeVisible();
});

it("requires a current reviewed preview and explicit approval before commit", async () => {
  render(<ImportsPage onExpired={() => {}} />);
  fireEvent.change(await screen.findByLabelText("Saved migrations"), {
    target: { value: batch.id },
  });
  await screen.findByText("Status: DRAFT · revision 2");
  fireEvent.click(screen.getByRole("button", { name: "4. Review & commit" }));
  fireEvent.click(screen.getByRole("button", { name: "Save and rebuild preview" }));
  await screen.findByText("Reconstructed settlement", { exact: false });
  const commit = screen.getByRole("button", { name: "Commit approved migration" });
  expect(commit).toBeDisabled();
  fireEvent.click(screen.getByLabelText(/I approve this exact plan/));
  expect(commit).toBeEnabled();
  fireEvent.click(commit);
  await waitFor(() => expect(api.commitImport).toHaveBeenCalledWith(batch, "preview-token"));
});

it("marks the preview stale after changing a reviewed balance", async () => {
  render(<ImportsPage onExpired={() => {}} />);
  fireEvent.change(await screen.findByLabelText("Saved migrations"), {
    target: { value: batch.id },
  });
  await screen.findByText("Status: DRAFT · revision 2");
  fireEvent.click(screen.getByRole("button", { name: "4. Review & commit" }));
  fireEvent.click(screen.getByRole("button", { name: "Save and rebuild preview" }));
  await screen.findByText("Reconstructed settlement", { exact: false });
  fireEvent.change(screen.getByLabelText(/Verified closing balance — Synthetic Bank/), {
    target: { value: "919" },
  });
  expect(screen.getByText(/preview is out of date/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Commit approved migration" })).toBeDisabled();
});

it("deletes a draft from saved migrations and allows a fresh upload", async () => {
  vi.mocked(api.imports).mockResolvedValueOnce([
    { id: batch.id, status: batch.status, version: batch.version, createdAt: batch.createdAt },
  ]);
  vi.mocked(api.imports).mockResolvedValueOnce([]);
  render(<ImportsPage onExpired={() => {}} />);
  fireEvent.change(await screen.findByLabelText("Saved migrations"), {
    target: { value: batch.id },
  });
  await screen.findByRole("heading", { name: "Delete draft" });
  fireEvent.click(screen.getByLabelText(/source and draft cannot be recovered/));
  fireEvent.click(screen.getByRole("button", { name: "Confirm draft deletion" }));
  await waitFor(() => expect(api.deleteImportDraft).toHaveBeenCalledWith(batch));
  expect(await screen.findByText(/same file can be uploaded again/)).toBeVisible();
  expect(screen.queryByText(/batch-1/)).not.toBeInTheDocument();
});

it("leaves categories unset and preserves the original label in the description", async () => {
  render(<ImportsPage onExpired={() => {}} />);
  fireEvent.change(await screen.findByLabelText("Saved migrations"), {
    target: { value: batch.id },
  });
  await screen.findByText("Status: DRAFT · revision 2");
  fireEvent.click(screen.getByRole("button", { name: "2. Map" }));
  const apply = screen.getByRole("button", { name: "Use Uncategorized for all rows" });
  fireEvent.click(apply);
  fireEvent.click(apply);
  expect(screen.getByText(/All rows are uncategorized/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(api.saveImport).toHaveBeenCalled());
  const saved = vi.mocked(api.saveImport).mock.calls[0][1];
  expect(saved.categories).toEqual([]);
  expect(saved.rows[0].category).toBe("NONE");
  expect(saved.rows[0].description).toBe("Synthetic purchase | Original category: Food");
});

it("previews paired transfers once and keeps card settlements visible beside paginated transactions", async () => {
  const purchase = preview.operations[0];
  vi.mocked(api.previewImport).mockResolvedValue({
    ...preview,
    operations: [
      ...Array.from({ length: 60 }, (_, index) => ({
        ...purchase,
        key: `row:${index + 10}`,
        rows: [index + 10],
      })),
      { ...purchase, key: "refund", kind: "REFUND", amount: "20" },
      {
        ...preview.operations[1],
        key: "transfer:3:4",
        reconstructed: false,
        rows: [3, 4],
        amount: "75",
        description: "Synthetic paired transfer",
      },
      preview.operations[1],
    ],
  });
  render(<ImportsPage onExpired={() => {}} />);
  fireEvent.change(await screen.findByLabelText("Saved migrations"), {
    target: { value: batch.id },
  });
  await screen.findByText("Status: DRAFT · revision 2");
  fireEvent.click(screen.getByRole("button", { name: "3. Edit preview" }));
  fireEvent.click(screen.getByRole("button", { name: "Build transaction and transfer preview" }));
  const transfers = await screen.findByRole("region", { name: "Planned transfers" });
  expect(within(transfers).getByText("Rows 3, 4")).toBeVisible();
  expect(within(transfers).getAllByText("Synthetic paired transfer")).toHaveLength(1);
  expect(within(transfers).getByText("CHF 75")).toBeVisible();
  expect(within(transfers).getByText(/Reconstructed settlement/)).toBeVisible();
  expect(within(transfers).getByText("Synthetic Bank → Synthetic Visa")).toBeVisible();
  const transactions = screen.getByRole("region", { name: "Planned account transactions" });
  expect(within(transactions).getAllByText("CHF -80").length).toBeGreaterThan(0);
  expect(within(transactions).getByText("CHF +20")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Build transaction and transfer preview" }),
  ).toBeVisible();
});
