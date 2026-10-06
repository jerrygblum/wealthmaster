import type { ComponentType } from "react";
import { Fragment } from "react";
import type {
  MonthlyLimitBreakdownProps,
  SpendingLimitEditorProps,
} from "../../../types/componentProps";
import type { BudgetComparison, SpendingReport } from "../../../types/models";
import type { SpendingPageViewModel } from "../../../types/viewModels";
import { nonzero, spendingBranchId, zero } from "../../../utils/spendingPresentation";
import { Button, Link } from "../../atoms/Controls";
export function SpendingHierarchyTable({
  data,
  all,
  editing,
  setEditing,
  activityLoading,
  monthEditing,
  setMonthEditing,
  onExpired,
  load,
  expanded,
  setExpanded,
  openActivity,
  summary,
  SpendingLimitEditor,
  MonthlyLimitBreakdown,
}: Pick<
  SpendingPageViewModel,
  | "data"
  | "all"
  | "editing"
  | "setEditing"
  | "activityLoading"
  | "monthEditing"
  | "setMonthEditing"
  | "onExpired"
  | "load"
  | "expanded"
  | "setExpanded"
  | "openActivity"
> & {
  data: SpendingReport;
  summary: SpendingReport["currencies"][number];
  SpendingLimitEditor: ComponentType<SpendingLimitEditorProps>;
  MonthlyLimitBreakdown: ComponentType<MonthlyLimitBreakdownProps>;
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
  const editor = (id: string, label: string, b: BudgetComparison | undefined) =>
    editing?.categoryId === id && editing.currency === summary.currency ? (
      <tr>
        <td colSpan={10}>
          <SpendingLimitEditor
            categoryId={id}
            label={label}
            currency={summary.currency}
            comparison={b}
            periodType={b?.periodType ?? data.periodType}
            periodStart={b?.periodStart ?? data.periodStart}
            settingReference={
              b?.settingReference ??
              (() => {
                const setting = data.settings?.find(
                  (s) => s.categoryId === id && s.currency === summary.currency,
                );
                return setting ? { id: setting.id, version: setting.version } : null;
              })()
            }
            businessDate={data.businessDate}
            available={data.categories.find((c) => c.id === id)?.available ?? false}
            onExpired={onExpired}
            onCancel={() => setEditing(undefined)}
            onSaved={async () => {
              setEditing(undefined);
              await load();
            }}
          />
        </td>
      </tr>
    ) : null;
  const row = (id: string | null, label: string, direct = false) => {
    const a = amount(id, direct),
      b = direct ? undefined : limit(id);
    return (
      <Fragment key={`${id}-${direct}`}>
        <tr id={direct ? undefined : branchId(id)} tabIndex={-1}>
          <th scope="row">
            {label}
            {id &&
              !direct &&
              !data.categories.find((c) => c.id === id)?.available &&
              " (archived branch)"}
          </th>
          <td>{a.expenses}</td>
          <td>{a.refunds}</td>
          <td>{a.netSpending}</td>
          <td>
            {b ? (
              <>
                <strong>
                  {b.limit} {b.currency}
                </strong>
                <small>
                  {b.source === "MONTHLY_ROLLUP"
                    ? `Accrued monthly allowances · ${b.coveredMonths}/${b.accruedMonths} months have limits`
                    : `${b.periodType === "MONTH" ? b.periodStart.slice(0, 7) : b.periodStart.slice(0, 4)} · ${b.periodType === "MONTH" ? "Monthly" : "Yearly"} · ${b.source === "EXCEPTION" ? "Exception" : "Normal"}`}
                </small>
              </>
            ) : (
              "—"
            )}
          </td>
          <td>
            {b ? (
              <>
                {b.actual}
                <small>{b.usageEnd ? `${b.usageStart} to ${b.usageEnd}` : "Not started"}</small>
              </>
            ) : (
              "—"
            )}
          </td>
          <td>{b?.remaining ?? "—"}</td>
          <td>{b ? (b.percentage === null ? "Not applicable" : `${b.percentage}%`) : "—"}</td>
          <td>{b ? (b.overBudget ? "Over budget" : "Within budget") : "No limit"}</td>
          <td>
            {!direct && (
              <>
                <Button
                  disabled={activityLoading || !!editing || monthEditing}
                  onClick={() => void openActivity(id, label, summary.currency)}
                >
                  Supporting activity
                </Button>
                {id && (
                  <>
                    {b?.source === "MONTHLY_ROLLUP" ? (
                      <MonthlyLimitBreakdown
                        categoryId={id}
                        label={label}
                        currency={summary.currency}
                        year={Number(data.periodStart.slice(0, 4))}
                        available={data.categories.find((c) => c.id === id)?.available ?? false}
                        onSaved={load}
                        onExpired={onExpired}
                        onEditingChange={setMonthEditing}
                      />
                    ) : (
                      <Button
                        disabled={
                          !!editing ||
                          monthEditing ||
                          (!data.categories.find((c) => c.id === id)?.available &&
                            !b?.overrideReference)
                        }
                        onClick={() =>
                          setEditing({
                            categoryId: id,
                            currency: summary.currency,
                            label,
                            comparison: b,
                          })
                        }
                      >
                        Edit limit
                      </Button>
                    )}
                    <Link href={`#/categories?categoryId=${id}`}>Normal setting</Link>
                  </>
                )}
              </>
            )}
          </td>
        </tr>
        {id && !direct && editor(id, label, b)}
      </Fragment>
    );
  };
  return (
    <div className="spending-table">
      <table>
        <caption>
          Exact spending in {summary.currency}. Parent totals are inclusive; child and direct rows
          are breakdowns.
        </caption>
        <thead>
          <tr>
            {[
              "Category",
              "Expenses",
              "Refunds",
              "Net spending",
              "Limit",
              "Spending used",
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
                <tr>
                  <td colSpan={10}>
                    <Button
                      aria-expanded={expanded.includes(c.id)}
                      onClick={() =>
                        setExpanded((ids) =>
                          ids.includes(c.id) ? ids.filter((id) => id !== c.id) : [...ids, c.id],
                        )
                      }
                    >
                      {expanded.includes(c.id) ? "Collapse" : "Expand"} {c.name}
                    </Button>
                  </td>
                </tr>
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
