import { displayAmount } from "../../../utils/accountPresentation";
import { Fragment } from "react";
import type { SpendingReport } from "../../../types/models";
import type { SpendingPageViewModel } from "../../../types/viewModels";
import { nonzero, spendingBranchId, zero } from "../../../utils/spendingPresentation";
import { ActionIcon } from "../../atoms/ActionIcon";
import { Button, Link } from "../../atoms/Controls";
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
  const limit = (id: string | null) =>
    data.limits.find((b) => b.currency === summary.currency && b.categoryId === id);
  const relevant = (id: string) =>
    all ||
    nonzero(amount(id).expenses) ||
    nonzero(amount(id).refunds) ||
    !!limit(id) ||
    data.categories.some((c) => c.parentId === id && !!limit(c.id));
  const branchId = (id: string | null) => spendingBranchId(summary.currency, id);
  const row = (id: string | null, label: string, direct = false) => {
    const a = amount(id, direct),
      b = direct ? undefined : limit(id);
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
          <td>{displayAmount(a.expenses)}</td>
          <td>{displayAmount(a.refunds)}</td>
          <td>{displayAmount(a.netSpending)}</td>
          <td>
            {b ? (
              <>
                <strong>
                  {displayAmount(b.limit)} {b.currency}
                </strong>
                <small>
                  {b.periodType === "MONTH" ? b.periodStart.slice(0, 7) : b.periodStart.slice(0, 4)}
                  {" · "}
                  {b.periodType === "MONTH" ? "Monthly" : "Yearly"}
                </small>
              </>
            ) : (
              "—"
            )}
          </td>
          <td>{b ? displayAmount(b.remaining) : "—"}</td>
          <td>
            {b
              ? b.percentage === null
                ? "Not applicable"
                : `${displayAmount(b.percentage)}%`
              : "—"}
          </td>
          <td>
            {b
              ? b.overBudget
                ? "Over budget"
                : "Within budget"
              : category?.parentId
                ? "Included in main category"
                : "No limit"}
          </td>
          <td>
            {!direct && (
              <div className="spending-row-actions">
                <Button
                  variant="secondary"
                  className="spending-action"
                  aria-label="Supporting activity"
                  title={`View activity for ${label}`}
                  disabled={activityLoading}
                  onClick={() => void openActivity(id, label, summary.currency)}
                >
                  <ActionIcon action="activity" />
                </Button>
                {id && parent && (
                  <>
                    <Link
                      className="secondary spending-action"
                      aria-label="Manage limit"
                      title={`Manage ${label} in Categories`}
                      href={`#/categories?categoryId=${id}`}
                    >
                      <ActionIcon action="settings" />
                    </Link>
                  </>
                )}
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
            {[
              "Category",
              "Expenses",
              "Refunds",
              "Net spending",
              "Limit",
              "Remaining allowance",
              "Percentage used",
              "Status",
              "Actions",
            ].map((s) => (
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
