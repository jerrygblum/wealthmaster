import { Button, Checkbox, Link, LoadingIndicator, Select } from "../../atoms/Controls";
import { WorkspaceHeading } from "../application/WorkspaceHeading";
import { categoryLabel } from "../../../utils/categoryPresentation";
import type { OriginalCategoriesViewModel } from "../../../types/viewModels";

export function OriginalCategoriesView(model: OriginalCategoriesViewModel) {
  const { groups, group, target, categories, pending, loading, stale, affected, page } = model;
  const busy = pending || loading;
  return (
    <>
      <WorkspaceHeading title="Category mapping" subtitle="Review original workbook categories" />
      <p>
        Map preserved original categories to your existing categories. Income and spending are
        reviewed separately; transfers are excluded.
      </p>
      <Button variant="secondary" disabled={busy} onClick={() => void model.load()}>
        Refresh groups
      </Button>
      {loading && <LoadingIndicator role="status">Loading original categories…</LoadingIndicator>}
      {model.error && (
        <p className="error" role="alert">
          {model.error}
        </p>
      )}
      {model.notice && <p role="status">{model.notice}</p>}
      {!loading && !groups.length && !model.error && (
        <section className="panel">
          <h2>No original categories found</h2>
          <p>
            Transactions with “Original category:” in their descriptions will appear here after
            migration.
          </p>
        </section>
      )}
      {groups.length > 0 && (
        <section className="panel">
          <h2>Original categories ({groups.length})</h2>
          <div className="import-table">
            <table>
              <thead>
                <tr>
                  <th>Original category</th>
                  <th>Type</th>
                  <th>Transactions</th>
                  <th>Uncategorized</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((item) => (
                  <tr key={`${item.type}:${item.originalCategory}`}>
                    <th scope="row">{item.originalCategory}</th>
                    <td>{item.type === "INCOME" ? "Income" : "Spending"}</td>
                    <td>{item.transactions.length}</td>
                    <td>{item.uncategorizedCount}</td>
                    <td>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        aria-pressed={group === item}
                        onClick={() => model.select(item)}
                      >
                        Review {item.originalCategory} (
                        {item.type === "INCOME" ? "Income" : "Spending"})
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {group && (
        <section className="panel" aria-label="Review original category">
          <h2>
            {group.originalCategory} — {group.type === "INCOME" ? "Income" : "Spending"}
          </h2>
          <p>
            {group.transactions.length} transactions · {group.uncategorizedCount} uncategorized
          </p>
          <label>
            Map to existing category
            <Select
              disabled={busy}
              value={model.targetId}
              onChange={(e) => model.chooseTarget(e.target.value)}
            >
              <option value="">Choose category</option>
              {categories
                .filter((item) => item.available && item.type === group.type)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {categoryLabel(item, categories)}
                  </option>
                ))}
            </Select>
          </label>
          {!categories.some((item) => item.available && item.type === group.type) && (
            <p>
              Create or restore a compatible category in <Link href="#/categories">Categories</Link>{" "}
              first.
            </p>
          )}
          <label>
            <Checkbox
              disabled={busy}
              checked={model.includeCategorized}
              onChange={(e) => model.includeExisting(e.target.checked)}
            />
            Include already categorized transactions (replace their categories)
          </label>
          <p>
            {affected.length} transactions selected for mapping. Review their dates, accounts and
            current categories below.
          </p>
          <div className="import-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Kind</th>
                  <th>Amount</th>
                  <th>Description</th>
                  <th>Current category</th>
                  <th>Mapping</th>
                </tr>
              </thead>
              <tbody>
                {group.transactions.slice(page * 25, page * 25 + 25).map((row) => (
                  <tr key={row.id}>
                    <td>{row.date}</td>
                    <td>
                      <Link href={`#/accounts/${row.accountId}`}>{row.accountName}</Link>
                    </td>
                    <td>{row.kind}</td>
                    <td>
                      {row.currency} {row.amount}
                    </td>
                    <td>{row.description}</td>
                    <td>
                      {row.category
                        ? [row.category.parentName, row.category.name].filter(Boolean).join(" → ")
                        : "Uncategorized"}
                      {row.category && !row.category.available && " (archived)"}
                    </td>
                    <td>
                      {model.includeCategorized || !row.categoryId
                        ? "Selected"
                        : "Keep current category"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <Button
              variant="secondary"
              disabled={busy || !page}
              onClick={() => model.setPage(page - 1)}
            >
              Previous transactions
            </Button>
            <span>
              Page {page + 1} of {Math.max(1, Math.ceil(group.transactions.length / 25))}
            </span>
            <Button
              variant="secondary"
              disabled={busy || (page + 1) * 25 >= group.transactions.length}
              onClick={() => model.setPage(page + 1)}
            >
              Next transactions
            </Button>
          </div>
          {model.confirming && target ? (
            <div role="region" aria-label="Confirm category mapping">
              <p>
                Assign {categoryLabel(target, categories)} to {affected.length} reviewed
                transactions from “{group.originalCategory}”?
              </p>
              <Button disabled={busy || stale} onClick={() => void model.apply()}>
                Confirm mapping
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => model.setConfirming(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              disabled={busy || stale || !target || !affected.length}
              onClick={() => model.setConfirming(true)}
            >
              Map {affected.length} transactions
            </Button>
          )}
        </section>
      )}
    </>
  );
}
