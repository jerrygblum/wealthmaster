import { displayAmount } from "../../../utils/accountPresentation";
import { Fragment } from "react";
import type { SpendingReport } from "../../../types/models";
import type { SpendingPageViewModel } from "../../../types/viewModels";
import { nonzero, spendingBranchId, zero } from "../../../utils/spendingPresentation";
import { ActionIcon } from "../../atoms/ActionIcon";
import { Button } from "../../atoms/Controls";
export function SpendingHierarchyTable({
  data,
  all,
  activityLoading,
  expanded,
  setExpanded,
  openActivity,
  summary,
}: Pick<
  SpendingPageViewModel,
  "data" | "all" | "activityLoading" | "expanded" | "setExpanded" | "openActivity"
> & {
  data: SpendingReport;
  summary: SpendingReport["currencies"][number];
}) {
  const amount = (id: string | null, direct = false) => {
    const group = data.groups.find((g) => g.currency === summary.currency && g.categoryId === id);
    return (direct ? group?.direct : group?.inclusive) || zero;
  };
  const relevant = (id: string) =>
    all || nonzero(amount(id).expenses) || nonzero(amount(id).refunds);
  const branchId = (id: string | null) => spendingBranchId(summary.currency, id);
  const row = (id: string | null, label: string, direct = false) => {
    const a = amount(id, direct);
    const category = data.categories.find((c) => c.id === id);
    const parent = !!category && !category.parentId && !direct;
    return (
      <Fragment key={`${id}-${direct}`}>
        <tr
          id={direct ? undefined : branchId(id)}
          tabIndex={-1}
          className={direct || category?.parentId ? "spending-child-row" : undefined}
        >
          <th scope="row">
            <div className="spending-row-name">
              {parent && (
                <Button
                  variant="secondary"
                  className="spending-expand"
                  aria-label={`${expanded.includes(category.id) ? "Collapse" : "Expand"} ${category.name}`}
                  aria-expanded={expanded.includes(category.id)}
                  onClick={() =>
                    setExpanded((ids) =>
                      ids.includes(category.id)
                        ? ids.filter((value) => value !== category.id)
                        : [...ids, category.id],
                    )
                  }
                >
                  <ActionIcon action={expanded.includes(category.id) ? "collapse" : "expand"} />
                </Button>
              )}
              <span>
                {label}
                {id &&
                  !direct &&
                  !data.categories.find((c) => c.id === id)?.available &&
                  " (archived branch)"}
              </span>
            </div>
          </th>
          <td data-label="Expenses">{displayAmount(a.expenses)}</td>
          <td data-label="Refunds">{displayAmount(a.refunds)}</td>
          <td data-label="Net spending">
            <strong>{displayAmount(a.netSpending)}</strong>
          </td>
          <td className="spending-actions-cell">
            {!direct && (
              <div className="spending-row-actions">
                <Button
                  variant="secondary"
                  className="spending-action compact-action"
                  aria-label="Supporting activity"
                  title={`View activity for ${label}`}
                  disabled={activityLoading}
                  onClick={() => void openActivity(id, label, summary.currency)}
                >
                  <ActionIcon action="activity" />
                </Button>
              </div>
            )}
          </td>
        </tr>
      </Fragment>
    );
  };
  return (
    <div className="spending-table">
      <table>
        <caption>
          Spending in {summary.currency}, rounded to two decimals. Parent totals are inclusive;
          child and direct rows are breakdowns.
        </caption>
        <thead>
          <tr>
            {["Category", "Expenses", "Refunds", "Net spending", "Actions"].map((s) => (
              <th key={s} scope="col">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.categories
            .filter((c) => !c.parentId && relevant(c.id))
            .map((c) => (
              <Fragment key={c.id}>
                {row(c.id, `${c.name} (inclusive)`)}
                {expanded.includes(c.id) && (
                  <>
                    {row(c.id, `${c.name} — directly assigned`, true)}
                    {data.categories
                      .filter((child) => child.parentId === c.id && relevant(child.id))
                      .map((child) => row(child.id, `↳ ${child.name}`))}
                  </>
                )}
              </Fragment>
            ))}
          {row(null, "Uncategorized")}
        </tbody>
      </table>
    </div>
  );
}
