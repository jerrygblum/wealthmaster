import { Fragment, useState } from "react";
import { Button, Input, Select, Checkbox } from "../../atoms/Controls";
import { WorkspaceHeading } from "../application/WorkspaceHeading";
import type { ImportsPageViewModel } from "../../../types/viewModels";
import type {
  ImportPlan,
  ImportBatch,
  ImportSelection,
  ImportAccount,
  ImportCategory,
  ImportDecision,
  ImportResources,
} from "../../../types/imports";
import type { AccountType, BalanceMeaning, CategoryType } from "../../../types/models";

const fields: Record<string, string> = {
  date: "Date",
  kind: "Type",
  account: "Account",
  description: "Description",
  amount: "Amount",
  balance: "Balance Amount",
  category: "Category 1",
  card: "Credit card",
  cardText: "Credit card transaction text",
};
function raw(batch: ImportBatch, plan: ImportPlan, row: number, field: string) {
  return (
    batch.workbook?.sheets
      .find((s) => s.name === plan.selection.sheet)
      ?.rows.find((r) => r.number === row)
      ?.cells[plan.selection.columns[field]]?.value.trim() ?? ""
  );
}
function accountName(target: ImportAccount, resources: ImportResources) {
  return (
    target.create?.name ??
    resources.accounts.find((a) => a.id === target.existingId)?.name ??
    "Missing account"
  );
}
function categoryName(target: ImportCategory, resources: ImportResources) {
  return (
    target.create?.name ??
    resources.categories.find((c) => c.id === target.existingId)?.name ??
    "Missing category"
  );
}
function categoryParentName(target: ImportCategory, plan: ImportPlan, resources: ImportResources) {
  const parent = target.parentKey
    ? plan.categories.find((candidate) => candidate.key === target.parentKey)
    : null;
  return parent ? categoryName(parent, resources) : null;
}
function MappingOptions({
  field,
  plan,
  resources,
  kind,
}: {
  field: string;
  plan: ImportPlan;
  resources: ImportResources;
  kind?: string;
}) {
  return (
    <>
      <option value="">Choose explicitly…</option>
      {field === "card" && <option value="COMMENT">Comment / no card</option>}
      {field === "category" && <option value="NONE">Leave uncategorized</option>}
      {field === "category" ? (
        <>
          {plan.categories
            .filter(
              (t) =>
                (t.create?.type ??
                  resources.categories.find((c) => c.id === t.existingId)?.type) === kind,
            )
            .map((t) => (
              <option key={t.key} value={t.key}>
                {categoryName(t, resources)}
                {t.create ? " (proposed)" : ""}
              </option>
            ))}
          {resources.categories
            .filter(
              (c) =>
                c.available &&
                c.type === kind &&
                !plan.categories.some((t) => t.existingId === c.id),
            )
            .map((c) => (
              <option key={c.id} value={"existing:" + c.id}>
                {c.name}
              </option>
            ))}
        </>
      ) : (
        <>
          {plan.accounts
            .filter(
              (t) =>
                field !== "card" ||
                (t.create?.type ?? resources.accounts.find((a) => a.id === t.existingId)?.type) ===
                  "CREDIT_CARD",
            )
            .map((t) => (
              <option key={t.key} value={t.key}>
                {accountName(t, resources)}
                {t.create ? " (proposed)" : ""}
              </option>
            ))}
          {resources.accounts
            .filter(
              (a) =>
                a.active &&
                (field !== "card" || a.type === "CREDIT_CARD") &&
                !plan.accounts.some((t) => t.existingId === a.id),
            )
            .map((a) => (
              <option key={a.id} value={"existing:" + a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
        </>
      )}
    </>
  );
}
function SourceSelection({
  batch,
  onConfigure,
  pending,
}: {
  batch: ImportBatch;
  onConfigure: (selection: ImportSelection) => Promise<void>;
  pending: boolean;
}) {
  const [selection, setSelection] = useState<ImportSelection>(
    batch.plan?.selection ?? {
      sheet: batch.workbook?.sheets[0]?.name ?? "",
      headerRow: 2,
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
  );
  const sheet = batch.workbook?.sheets.find((s) => s.name === selection.sheet);
  return (
    <form
      className="panel form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        void onConfigure(selection);
      }}
    >
      <h2>Choose source columns</h2>
      <p>
        Dates represent bank movements, not purchase dates. Formulas are read from saved results;
        save a recalculated copy in Excel before uploading.
      </p>
      <label>
        Sheet
        <Select
          value={selection.sheet}
          onChange={(e) => setSelection({ ...selection, sheet: e.target.value })}
        >
          {batch.workbook?.sheets.map((s) => (
            <option key={s.name}>{s.name}</option>
          ))}
        </Select>
      </label>
      <label>
        Header row
        <Input
          type="number"
          min="1"
          value={selection.headerRow}
          onChange={(e) => setSelection({ ...selection, headerRow: Number(e.target.value) })}
        />
      </label>
      <div className="import-field-grid">
        {Object.entries(fields).map(([key, label]) => (
          <label key={key}>
            {label} column
            <Input
              required
              pattern="[A-Z]{1,3}"
              value={selection.columns[key]}
              onChange={(e) =>
                setSelection({
                  ...selection,
                  columns: { ...selection.columns, [key]: e.target.value.toUpperCase() },
                })
              }
            />
          </label>
        ))}
      </div>
      <details>
        <summary>Inspect first source rows</summary>
        <div className="import-table">
          <table>
            <tbody>
              {sheet?.rows.slice(0, 5).map((row) => (
                <tr key={row.number}>
                  <th>Row {row.number}</th>
                  {Object.entries(row.cells).map(([col, cell]) => (
                    <td key={col}>
                      {col}: {cell.value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <Button disabled={pending}>
        Prepare row decisions{batch.plan ? " (replaces current mappings)" : ""}
      </Button>
    </form>
  );
}
function ProposeAccount({
  add,
  start,
  pending,
}: {
  add: (account: ImportAccount) => void;
  start: string;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("CHECKING");
  const [currency, setCurrency] = useState("CHF");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(start);
  const [meaning, setMeaning] = useState<BalanceMeaning>("AMOUNT_OWED");
  return (
    <details>
      <summary>Propose a new account — created only after final approval</summary>
      <form
        className="import-field-grid"
        onSubmit={(e) => {
          e.preventDefault();
          add({
            key: "new_" + crypto.randomUUID(),
            existingId: null,
            version: null,
            closingBalance: "",
            create: {
              name,
              type,
              currency,
              openingAmount: amount,
              openingDate: date,
              balanceMeaning: type === "CREDIT_CARD" ? meaning : "BALANCE",
              institution: "",
            },
          });
          setName("");
          setAmount("");
        }}
      >
        <label>
          New account name
          <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          New account type
          <Select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
            {["CHECKING", "SAVINGS", "CASH", "CREDIT_CARD", "INVESTMENT", "OTHER"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </label>
        <label>
          Account currency
          <Input
            required
            pattern="[A-Z]{3}"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Opening amount
          <Input
            required
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        {type === "CREDIT_CARD" && (
          <label>
            Opening amount meaning
            <Select value={meaning} onChange={(e) => setMeaning(e.target.value as BalanceMeaning)}>
              <option value="AMOUNT_OWED">Amount owed</option>
              <option value="IN_CREDIT">In credit</option>
            </Select>
          </label>
        )}
        <label>
          Opening date
          <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <Button disabled={pending}>Add account proposal</Button>
      </form>
    </details>
  );
}
function ProposeCategory({
  add,
  resources,
  pending,
}: {
  add: (category: ImportCategory) => void;
  resources: ImportResources;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("SPENDING");
  const [parent, setParent] = useState("");
  return (
    <details>
      <summary>Propose a new category — created only after final approval</summary>
      <form
        className="import-field-grid"
        onSubmit={(e) => {
          e.preventDefault();
          add({
            key: "new_" + crypto.randomUUID(),
            existingId: null,
            version: null,
            create: { name, type, parentId: parent || null },
            parentKey: null,
          });
          setName("");
        }}
      >
        <label>
          New category name
          <Input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          New category type
          <Select
            value={type}
            onChange={(e) => {
              setType(e.target.value as CategoryType);
              setParent("");
            }}
          >
            <option value="SPENDING">Spending</option>
            <option value="INCOME">Income</option>
          </Select>
        </label>
        <label>
          Parent category
          <Select value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Top level</option>
            {resources.categories
              .filter((c) => c.available && !c.parentId && c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </label>
        <Button disabled={pending}>Add category proposal</Button>
      </form>
    </details>
  );
}
function Mappings(model: ImportsPageViewModel & { plan: ImportPlan; batch: ImportBatch }) {
  const { plan, batch, resources } = model;
  function groups(field: "account" | "card" | "category") {
    const groups = new Map<string, { source: string; kind: string; rows: ImportDecision[] }>();
    for (const row of plan.rows.filter((r) => r.include)) {
      if (field === "category" && row.kind.startsWith("Transfer")) continue;
      const source = raw(batch, plan, row.row, field),
        kind = row.kind === "Income" ? "INCOME" : "SPENDING",
        key = field === "category" ? kind + ":" + source : source;
      if (field === "card" && !source.toLowerCase().includes("visa")) continue;
      const group = groups.get(key) ?? { source, kind, rows: [] };
      group.rows.push(row);
      groups.set(key, group);
    }
    return [...groups.values()];
  }
  return (
    <section className="panel">
      <h2>Map accounts, cards and categories</h2>
      <p>
        Map each distinct workbook account and Visa label once. Other credit-card column values are
        treated as comments. Nothing is created until the final approved commit.
      </p>
      <ProposeAccount add={model.account} start={plan.start} pending={model.pending} />
      <ProposeCategory add={model.category} resources={resources} pending={model.pending} />
      {(["account", "card", "category"] as const).map((field) => (
        <section key={field}>
          <h3>
            {field === "account"
              ? "Paying accounts"
              : field === "card"
                ? "Credit-card identities or comments"
                : "Categories"}
          </h3>
          {groups(field).map((group) => {
            const chosen = new Set(group.rows.map((r) => r[field]));
            const value = chosen.size === 1 ? group.rows[0][field] : "";
            return (
              <label className="import-mapping" key={group.kind + group.source}>
                <span>
                  {group.source || "(blank)"} {field === "category" ? `(${group.kind})` : ""} ·{" "}
                  {group.rows.length} rows{chosen.size > 1 ? " · mixed decisions" : ""}
                </span>
                <Select
                  aria-label={`Map ${field} ${group.source || "blank"} ${field === "category" ? group.kind : ""}`}
                  value={value}
                  onChange={(e) =>
                    model.selectExisting(
                      field,
                      group.source,
                      e.target.value,
                      field === "category" ? group.kind : undefined,
                    )
                  }
                >
                  <MappingOptions
                    field={field}
                    plan={plan}
                    resources={resources}
                    kind={group.kind}
                  />
                </Select>
              </label>
            );
          })}
        </section>
      ))}
      <Button variant="secondary" onClick={() => model.useUncategorized()}>
        Use Uncategorized for all rows
      </Button>
      <p>
        New imports default to Uncategorized. Original workbook categories are kept in descriptions.
        Use this button to apply the same setting to an existing draft.
      </p>
      <h3>Targets in this draft</h3>
      <p>
        Review opening amounts before commit. Remove unused proposals to avoid creating unwanted
        items.
      </p>
      {plan.accounts.map((t) => (
        <div className="import-mapping" key={t.key}>
          <span>
            {accountName(t, resources)} —{" "}
            {t.create
              ? `${t.create.type}, ${t.create.currency}, opening ${t.create.openingAmount} (${t.create.balanceMeaning}), ${t.create.openingDate} — PROPOSED CREATION`
              : "existing account"}
          </span>
          <Button
            variant="secondary"
            onClick={() =>
              model.change({ ...plan, accounts: plan.accounts.filter((a) => a.key !== t.key) })
            }
          >
            Remove target {accountName(t, resources)}
          </Button>
        </div>
      ))}
      {plan.categories.map((t) => (
        <div className="import-mapping" key={t.key}>
          <span>
            {categoryName(t, resources)} — {t.create ? "PROPOSED CREATION" : "existing category"}
            {categoryParentName(t, plan, resources)
              ? ` · child of ${categoryParentName(t, plan, resources)}`
              : ""}
          </span>
          <Button
            variant="secondary"
            onClick={() =>
              model.change({ ...plan, categories: plan.categories.filter((c) => c.key !== t.key) })
            }
          >
            Remove target {categoryName(t, resources)}
          </Button>
        </div>
      ))}
      <Button
        variant="secondary"
        disabled={model.pending}
        onClick={() => void model.refreshMappings()}
      >
        Refresh account/category versions
      </Button>
    </section>
  );
}
function Rows(model: ImportsPageViewModel & { plan: ImportPlan; batch: ImportBatch }) {
  const { plan, batch } = model;
  const [page, setPage] = useState(0);
  const [onlyIncluded, setOnlyIncluded] = useState(false);
  const visible = plan.rows
      .filter((r) => !onlyIncluded || r.include)
      .sort(
        (a, b) =>
          raw(batch, plan, a.row, "account").localeCompare(raw(batch, plan, b.row, "account")) ||
          a.row - b.row,
      ),
    pages = Math.max(1, Math.ceil(visible.length / 25));
  const selected = visible.slice(
    Math.min(page, pages - 1) * 25,
    Math.min(page, pages - 1) * 25 + 25,
  );
  return (
    <section className="panel">
      <h2>Review row decisions</h2>
      <div className="import-field-grid">
        <label>
          Migration start
          <Input
            type="date"
            value={plan.start}
            onChange={(e) => model.change({ ...plan, start: e.target.value })}
          />
        </label>
        <label>
          Migration end
          <Input
            type="date"
            value={plan.end}
            onChange={(e) => model.change({ ...plan, end: e.target.value })}
          />
        </label>
        <label>
          <Checkbox
            checked={onlyIncluded}
            onChange={(e) => {
              setOnlyIncluded(e.target.checked);
              setPage(0);
            }}
          />
          Show included rows only
        </label>
        <Button
          variant="secondary"
          onClick={() =>
            model.change({
              ...plan,
              rows: plan.rows.map((r) =>
                r.description.trim()
                  ? r
                  : { ...r, description: `Legacy transaction — row ${r.row}` },
              ),
            })
          }
        >
          Fill blank descriptions with legacy row labels
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            model.change({
              ...plan,
              rows: plan.rows.map((r) =>
                r.include && (r.date < plan.start || r.date > plan.end)
                  ? { ...r, include: false, reason: "Outside selected migration period" }
                  : r,
              ),
            })
          }
        >
          Exclude rows outside selected period
        </Button>
      </div>
      <p>
        This table edits original workbook rows, not final ledger operations. Amounts retain
        workbook signs; negative expenses become refunds. Transfers require two linked source rows.
        Use “Build transaction and transfer preview” to see each combined transfer and generated
        monthly Visa settlement in the final preview.
      </p>
      <Button disabled={model.pending} onClick={() => void model.save(true, 2)}>
        Build transaction and transfer preview
      </Button>
      {model.preview && (
        <>
          {model.dirty && (
            <p role="status">This preview is out of date. Rebuild after editing source rows.</p>
          )}
          {model.preview.errors.length > 0 && (
            <div role="alert">
              <ul>
                {model.preview.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <PlannedOperations {...model} transfers={false} />
          <PlannedOperations {...model} transfers />
        </>
      )}
      <details>
        <summary>Edit original workbook rows (transfers have two signed source rows)</summary>
        <div className="import-table import-edit-table">
          <table>
            <thead>
              <tr>
                <th>Use / source</th>
                <th>Date</th>
                <th>Kind</th>
                <th>Account</th>
                <th>Card / transfer partner</th>
                <th>Category</th>
                <th>Workbook amount</th>
                <th>Description</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((row, index) => {
                const sourceAccount = raw(batch, plan, row.row, "account") || "(blank account)";
                const previous =
                  index > 0 ? raw(batch, plan, selected[index - 1].row, "account") : null;
                return (
                  <tr key={row.row} className={!row.include ? "import-excluded" : undefined}>
                    <td>
                      {sourceAccount !== previous && <strong>{sourceAccount}</strong>}
                      <label>
                        <Checkbox
                          checked={row.include}
                          onChange={(e) => model.row(row.row, { include: e.target.checked })}
                        />
                        Row {row.row}
                      </label>
                    </td>
                    <td>
                      <Input
                        aria-label={`Date row ${row.row}`}
                        type="date"
                        value={row.date}
                        onChange={(e) => model.row(row.row, { date: e.target.value })}
                      />
                    </td>
                    <td>
                      <Select
                        aria-label={`Kind row ${row.row}`}
                        value={row.kind}
                        onChange={(e) => model.row(row.row, { kind: e.target.value })}
                      >
                        {["Income", "Expense", "Transfer -", "Transfer +"].map((kind) => (
                          <option key={kind}>{kind}</option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      <Select
                        aria-label={`Account row ${row.row}`}
                        value={row.account}
                        onChange={(e) => model.row(row.row, { account: e.target.value })}
                      >
                        <option value="">Choose account</option>
                        {plan.accounts.map((target) => (
                          <option key={target.key} value={target.key}>
                            {accountName(target, model.resources)}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td>
                      {row.kind.startsWith("Transfer") ? (
                        <Input
                          aria-label={`Partner row ${row.row}`}
                          type="number"
                          min="1"
                          value={row.partner ?? ""}
                          onChange={(e) =>
                            model.row(row.row, {
                              partner: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        />
                      ) : (
                        <Select
                          aria-label={`Card row ${row.row}`}
                          value={row.card}
                          onChange={(e) => model.row(row.row, { card: e.target.value })}
                        >
                          <option value="">Choose Visa account</option>
                          <option value="COMMENT">No Visa / comment</option>
                          {plan.accounts
                            .filter(
                              (target) =>
                                (target.create?.type ??
                                  model.resources.accounts.find(
                                    (account) => account.id === target.existingId,
                                  )?.type) === "CREDIT_CARD",
                            )
                            .map((target) => (
                              <option key={target.key} value={target.key}>
                                {accountName(target, model.resources)}
                              </option>
                            ))}
                        </Select>
                      )}
                    </td>
                    <td>
                      {row.kind.startsWith("Transfer") ? (
                        "—"
                      ) : (
                        <Select
                          aria-label={`Category row ${row.row}`}
                          value={row.category}
                          onChange={(e) => model.row(row.row, { category: e.target.value })}
                        >
                          <option value="">Choose category</option>
                          <option value="NONE">Uncategorized</option>
                          {plan.categories.map((target) => (
                            <option key={target.key} value={target.key}>
                              {categoryName(target, model.resources)}
                            </option>
                          ))}
                        </Select>
                      )}
                    </td>
                    <td>
                      <Input
                        aria-label={`Amount row ${row.row}`}
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => model.row(row.row, { amount: e.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        aria-label={`Description row ${row.row}`}
                        maxLength={500}
                        value={row.description}
                        onChange={(e) => model.row(row.row, { description: e.target.value })}
                      />
                    </td>
                    <td>
                      <Input
                        aria-label={`Reason row ${row.row}`}
                        maxLength={1000}
                        value={row.reason}
                        onChange={(e) => model.row(row.row, { reason: e.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="form-actions">
          <Button variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous rows
          </Button>
          <span>
            Page {Math.min(page, pages - 1) + 1} of {pages} · {visible.length} rows
          </span>
          <Button
            variant="secondary"
            disabled={page >= pages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next rows
          </Button>
        </div>
      </details>
    </section>
  );
}
function PlannedOperations(model: ImportsPageViewModel & { plan: ImportPlan; transfers: boolean }) {
  const { plan, preview, transfers } = model;
  const [page, setPage] = useState(0);
  const name = (key: string | null) =>
    key
      ? accountName(
          plan.accounts.find((a) => a.key === key) ?? {
            key,
            existingId: null,
            version: null,
            create: null,
            closingBalance: "",
          },
          model.resources,
        )
      : "";
  const category = (key: string | null) => {
    const target = key ? plan.categories.find((item) => item.key === key) : null;
    return target ? categoryName(target, model.resources) : "Uncategorized";
  };
  const operations = preview
    ? preview.operations
        .filter((op) => (op.kind === "TRANSFER") === transfers)
        .sort(
          (a, b) =>
            name(a.account).localeCompare(name(b.account)) ||
            (transfers ? name(a.destination).localeCompare(name(b.destination)) : 0) ||
            a.date.localeCompare(b.date) ||
            a.key.localeCompare(b.key),
        )
    : [];
  if (!preview) return null;
  return (
    <section aria-label={transfers ? "Planned transfers" : "Planned account transactions"}>
      <h3>{transfers ? "Transfers to be created" : "Account transactions to be created"}</h3>
      <p>
        {operations.length} {transfers ? "transfers" : "transactions"}
        {transfers &&
          ` · ${operations.filter((op) => op.reconstructed).length} reconstructed credit-card settlements`}
      </p>
      {transfers && (
        <p>
          Each transfer appears once, from source to destination. The amount is debited from the
          source and credited to the destination; it is not spending.
        </p>
      )}
      {!operations.length && (
        <p>
          {transfers
            ? "No transfers in this preview. Map Visa rows to credit-card accounts and resolve transfer pairing errors, then rebuild the preview."
            : "No account transactions in this preview."}
        </p>
      )}
      <div className="import-table">
        <table>
          <thead>
            <tr>
              <th>{transfers ? "From account" : "Account"}</th>
              <th>Date / source</th>
              <th>Kind</th>
              {transfers && <th>To account</th>}
              <th>Category</th>
              <th>{transfers ? "Amount transferred" : "Balance movement"}</th>
              <th>Description</th>
              <th>Duplicate decision</th>
            </tr>
          </thead>
          <tbody>
            {operations.slice(page * 50, page * 50 + 50).map((op, index, shown) => (
              <Fragment key={op.key}>
                {(index === 0 ||
                  shown[index - 1].account !== op.account ||
                  (transfers && shown[index - 1].destination !== op.destination)) && (
                  <tr>
                    <th colSpan={transfers ? 8 : 7} scope="rowgroup">
                      {name(op.account)}
                      {transfers && ` → ${name(op.destination)}`}
                    </th>
                  </tr>
                )}
                <tr>
                  <th>{name(op.account)}</th>
                  <td>
                    {op.date}
                    <br />
                    <span>Rows {op.rows.join(", ")}</span>
                  </td>
                  <td>
                    {op.kind}
                    {op.reconstructed && <strong> · Reconstructed settlement</strong>}
                  </td>
                  {transfers && <td>{name(op.destination)}</td>}
                  <td>{op.kind === "TRANSFER" ? "—" : category(op.category)}</td>
                  <td>
                    {op.currency}{" "}
                    {transfers ? op.amount : `${op.kind === "EXPENSE" ? "-" : "+"}${op.amount}`}
                  </td>
                  <td>{op.description}</td>
                  <td>
                    {preview.duplicates[op.key]?.length > 0 ? (
                      <Select
                        aria-label={`Duplicate decision ${op.key}`}
                        value={
                          plan.duplicates[op.key]?.mode === "KEEP"
                            ? "KEEP"
                            : (plan.duplicates[op.key]?.existingId ?? "")
                        }
                        onChange={(e) => {
                          const candidate = preview.duplicates[op.key].find(
                            (c) => c.id === e.target.value,
                          );
                          model.change({
                            ...plan,
                            duplicates: {
                              ...plan.duplicates,
                              [op.key]: candidate
                                ? {
                                    mode: "LINK",
                                    existingId: candidate.id,
                                    version: candidate.version,
                                  }
                                : { mode: "KEEP", existingId: null, version: null },
                            },
                          });
                        }}
                      >
                        <option value="">Review possible duplicate</option>
                        <option value="KEEP">Create separately (keep both)</option>
                        {preview.duplicates[op.key].map((c) => (
                          <option key={c.id} value={c.id}>
                            Link existing: {c.date} · {c.description} · {c.amount}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      "No matching existing operation"
                    )}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-actions">
        <Button variant="secondary" disabled={!page} onClick={() => setPage(page - 1)}>
          Previous {transfers ? "transfers" : "transactions"}
        </Button>
        <Button
          variant="secondary"
          disabled={(page + 1) * 50 >= operations.length}
          onClick={() => setPage(page + 1)}
        >
          Next {transfers ? "transfers" : "transactions"}
        </Button>
      </div>
    </section>
  );
}
function Review(model: ImportsPageViewModel & { plan: ImportPlan; batch: ImportBatch }) {
  const { plan, preview } = model;
  const name = (key: string | null) =>
    key
      ? accountName(
          plan.accounts.find((a) => a.key === key) ?? {
            key,
            existingId: null,
            version: null,
            create: null,
            closingBalance: "",
          },
          model.resources,
        )
      : "";
  return (
    <section className="panel">
      <h2>Reconcile and approve</h2>
      <p>
        Supply independent closing balances as of {plan.end}. Existing ledger movements are included
        once. Source dates are settlement dates; these rows cannot recover purchase dates or
        historical outstanding card debt.
      </p>
      {plan.accounts.map((target) => (
        <label className="import-mapping" key={target.key}>
          <span>Verified closing balance — {name(target.key)} (blank means unverified)</span>
          <Input
            inputMode="decimal"
            value={target.closingBalance}
            onChange={(e) =>
              model.change({
                ...plan,
                accounts: plan.accounts.map((t) =>
                  t.key === target.key ? { ...t, closingBalance: e.target.value } : t,
                ),
              })
            }
          />
        </label>
      ))}
      <Button disabled={model.pending} onClick={() => void model.save(true)}>
        Save and rebuild preview
      </Button>
      {preview && (
        <>
          <h3>Validation</h3>
          {model.dirty && (
            <p role="status">
              This preview is out of date. Save and rebuild it after resolving your choices.
            </p>
          )}
          <p>
            {preview.operations.length} operations · {preview.excluded.length} excluded source rows
            · {preview.errors.length} blocking issues
          </p>
          {preview.errors.length > 0 && (
            <div role="alert" className="error">
              <ul>
                {preview.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <details>
            <summary>Warnings and unverified balances ({preview.warnings.length})</summary>
            <ul>
              {preview.warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </details>
          <h3>Balance preview</h3>
          <div className="import-table">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Currency</th>
                  <th>Opening</th>
                  <th>Existing movements</th>
                  <th>New movements</th>
                  <th>Projected closing</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {preview.balances.map((b) => (
                  <tr key={b.key}>
                    <th>{b.name}</th>
                    <td>{b.currency}</td>
                    <td>{b.opening}</td>
                    <td>{b.existingMovements}</td>
                    <td>{b.importedMovements}</td>
                    <td>{b.projectedClosing}</td>
                    <td>{b.difference ?? "Unverified"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Activity totals</h3>
          {Object.entries(preview.totals).map(([key, value]) => (
            <p key={key}>
              {key}: {value}
            </p>
          ))}
          <p>Transfers are excluded from income and spending. Refunds reduce spending.</p>
          <PlannedOperations {...model} transfers={false} />
          <PlannedOperations {...model} transfers />
          <details>
            <summary>Excluded source rows ({preview.excluded.length})</summary>
            {plan.rows
              .filter((r) => !r.include)
              .map((r) => (
                <p key={r.row}>
                  Row {r.row}: {r.reason}
                </p>
              ))}
          </details>
          <h3>Creation approval</h3>
          <ul>
            {plan.accounts
              .filter((t) => t.create)
              .map((t) => (
                <li key={t.key}>
                  Create account {t.create?.name}, {t.create?.type}, {t.create?.currency}, opening{" "}
                  {t.create?.openingAmount} {t.create?.balanceMeaning} at {t.create?.openingDate}
                </li>
              ))}
            {plan.categories
              .filter((t) => t.create)
              .map((t) => (
                <li key={t.key}>
                  Create category {t.create?.name} ({t.create?.type})
                </li>
              ))}
          </ul>
          <label className="import-approval">
            <Checkbox
              checked={model.approval}
              onChange={(e) => model.setApproval(e.target.checked)}
            />
            I approve this exact plan, all listed account/category creations, transfer pairings,
            reconstructed card settlements, duplicate choices and exclusions. I confirm currencies
            and opening balances, acknowledge settlement-date reporting and explicitly accept any
            unverified closing balances.
          </label>
          <Button
            disabled={!model.approval || model.dirty || model.pending || preview.errors.length > 0}
            onClick={() => void model.commit()}
          >
            Commit approved migration
          </Button>
        </>
      )}
    </section>
  );
}
export function ImportsPageView(model: ImportsPageViewModel) {
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const { batch, plan } = model;
  const editable = batch?.status === "DRAFT" && !!batch.workbook;
  return (
    <>
      <WorkspaceHeading
        title={<>Legacy workbook migration</>}
        subtitle={<>Guided review · no automatic account or category creation</>}
      />
      {model.error && (
        <p className="error" role="alert">
          {model.error}
        </p>
      )}
      {model.notice && <p role="status">{model.notice}</p>}
      {model.pending && <p role="status">Working…</p>}
      <fieldset disabled={model.pending} className="import-controls">
        <legend>Migration workspace</legend>
        <section className="panel">
          <h2>Upload or resume</h2>
          <label>
            Workbook (.xlsx or .xlsm, up to 10 MiB)
            <Input
              type="file"
              disabled={model.dirty}
              accept=".xlsx,.xlsm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void model.upload(file);
                e.target.value = "";
              }}
            />
          </label>
          <p>
            Only upload a workbook you intend to migrate. Source files and drafts are private to
            your account. Macros are never executed.
          </p>
          <label>
            Saved migrations
            <Select
              value={batch?.id ?? ""}
              disabled={model.dirty}
              onChange={(e) => {
                if (e.target.value) void model.open(e.target.value);
              }}
            >
              <option value="">Choose a saved draft or receipt</option>
              {model.batches.map((b) => (
                <option value={b.id} key={b.id}>
                  {b.createdAt.slice(0, 10)} · {b.status} · {b.id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </label>
          {model.dirty && (
            <p role="status">
              Unsaved changes. Save this draft before uploading or switching migrations.
            </p>
          )}
        </section>
        {model.dirty && batch && (
          <Button variant="secondary" onClick={() => void model.open(batch.id)}>
            Discard unsaved changes and reload
          </Button>
        )}
        {batch && (
          <>
            <p>
              Status: {batch.status} · revision {batch.version}
            </p>
            {editable && (
              <>
                <div className="form-actions" role="group" aria-label="Migration steps">
                  {["Source", "Map", "Edit preview", "Review & commit"].map((label, index) => (
                    <Button
                      key={label}
                      variant="secondary"
                      aria-pressed={model.step === index}
                      disabled={index > 0 && !plan}
                      onClick={() => model.setStep(index)}
                    >
                      {index + 1}. {label}
                    </Button>
                  ))}
                </div>
                {model.step === 0 && (
                  <SourceSelection
                    key={batch.id}
                    batch={batch}
                    onConfigure={model.configure}
                    pending={model.pending}
                  />
                )}
                {plan && model.step === 1 && <Mappings {...model} plan={plan} batch={batch} />}
                {plan && model.step === 2 && <Rows {...model} plan={plan} batch={batch} />}
                {plan && model.step === 3 && <Review {...model} plan={plan} batch={batch} />}
                {plan && (
                  <div className="form-actions">
                    <Button variant="secondary" onClick={() => void model.save()}>
                      Save draft
                    </Button>
                    <Button onClick={() => void model.save(true)}>Save and review plan</Button>
                  </div>
                )}
              </>
            )}
            {batch.receipt && (
              <section className="panel">
                <h2>Migration receipt</h2>
                <p>
                  {batch.receipt.createdOperations} created operations;{" "}
                  {batch.receipt.linkedOperations} linked existing operations;{" "}
                  {Object.keys(batch.receipt.createdAccounts).length} created accounts;{" "}
                  {Object.keys(batch.receipt.createdCategories).length} created categories.
                </p>
                <p>
                  Committed {batch.receipt.committedAt}. Batch {batch.receipt.batchId}
                </p>
              </section>
            )}
            {batch.workbook && (
              <p>
                <a href={`/api/v1/imports/${batch.id}/source`}>
                  Download original private workbook
                </a>
              </p>
            )}
            {batch.status === "COMMITTED" && (
              <section className="panel">
                <h2>Reverse this batch</h2>
                <p>
                  Review dependencies first. Reversal removes only the batch-created ledger
                  activity; existing linked activity, accounts, categories and audit history remain.
                </p>
                <Button variant="secondary" onClick={() => void model.reviewUndo()}>
                  Preview undo
                </Button>
                {model.undo && (
                  <>
                    <p>{model.undo.operations} operations would be reversed.</p>
                    {model.undo.errors.map((error, index) => (
                      <p role="alert" key={index}>
                        {error}
                      </p>
                    ))}
                    <Button
                      disabled={model.undo.errors.length > 0}
                      onClick={() => void model.reverse()}
                    >
                      Confirm batch reversal
                    </Button>
                  </>
                )}
              </section>
            )}
            {batch.workbook && batch.status === "DRAFT" && (
              <section className="panel">
                <h2>Delete draft</h2>
                <p>
                  This permanently removes the uploaded file and draft. It disappears from saved
                  migrations, and the same file can be uploaded again.
                </p>
                <label>
                  <Checkbox
                    checked={purgeConfirm}
                    onChange={(e) => setPurgeConfirm(e.target.checked)}
                  />
                  I understand the source and draft cannot be recovered here.
                </label>
                <Button
                  variant="secondary"
                  disabled={!purgeConfirm}
                  onClick={() => {
                    setPurgeConfirm(false);
                    void model.deleteDraft();
                  }}
                >
                  Confirm draft deletion
                </Button>
              </section>
            )}
            {batch.workbook && batch.status === "REVERSED" && (
              <section className="panel">
                <h2>Delete retained private source</h2>
                <p>The receipt and audit trail remain after the workbook source is purged.</p>
                <label>
                  <Checkbox
                    checked={purgeConfirm}
                    onChange={(e) => setPurgeConfirm(e.target.checked)}
                  />
                  I understand the source cannot be recovered here.
                </label>
                <Button
                  variant="secondary"
                  disabled={!purgeConfirm}
                  onClick={() => {
                    setPurgeConfirm(false);
                    void model.purge();
                  }}
                >
                  Confirm source deletion
                </Button>
              </section>
            )}
          </>
        )}
      </fieldset>
    </>
  );
}
