import { displayAmount } from "../../../utils/accountPresentation";
import { Button, Checkbox, Input, Link, LoadingIndicator } from "../../atoms/Controls";
import { ActionIcon } from "../../atoms/ActionIcon";
import { ActionGroup } from "../../molecules/ActionGroup";
import { WorkspaceHeading } from "../application/WorkspaceHeading";
import { SpendingHierarchyTable } from "./SpendingHierarchyTable";

import type { SpendingPageViewModel } from "../../../types/viewModels";

export function SpendingPageView({
  period,
  changePeriod,
  start,
  entry,
  changeEntry,
  commitEntry,
  canPrevious,
  canNext,
  data,
  loading,
  error,
  all,
  setAll,
  expanded,
  setExpanded,
  activity,
  setActivity,
  activityLoading,
  setActivityLoading,
  activityGeneration,
  load,
  move,
  openActivity,
}: SpendingPageViewModel) {
  return (
    <>
      <WorkspaceHeading title="Spending" />
      <p className="workspace-description">
        See expenses, refunds and net spending by category. Each currency is reported separately.
      </p>
      <ActionGroup className="workspace-toolbar spending-toolbar">
        <div className="period-type-control" role="group" aria-label="Period type">
          {(["MONTH", "YEAR"] as const).map((type) => (
            <Button
              key={type}
              variant="secondary"
              aria-pressed={period === type}
              disabled={loading}
              onClick={() => changePeriod(type)}
            >
              {type === "MONTH" ? "Month" : "Year"}
            </Button>
          ))}
        </div>
        <div className="period-navigation">
          <Button
            variant="secondary"
            className="compact-action"
            aria-label="Previous period"
            title={`Previous ${period === "MONTH" ? "month" : "year"}`}
            disabled={loading || !canPrevious}
            onClick={() => move(-1)}
          >
            <ActionIcon action="previous" />
          </Button>
          <label className={`period-field ${period === "YEAR" ? "period-field-year" : ""}`}>
            <span className="sr-only">Period</span>
            <Input
              required
              disabled={loading}
              type={period === "MONTH" ? "month" : "number"}
              min={period === "YEAR" ? "1" : "0001-01"}
              max={period === "YEAR" ? "9999" : "9999-12"}
              value={entry}
              onChange={(e) => changeEntry(e.target.value)}
              onBlur={commitEntry}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEntry();
                }
              }}
            />
          </label>
          <Button
            variant="secondary"
            className="compact-action"
            aria-label="Next period"
            title={`Next ${period === "MONTH" ? "month" : "year"}`}
            disabled={loading || !canNext}
            onClick={() => move(1)}
          >
            <ActionIcon action="next" />
          </Button>
        </div>
      </ActionGroup>
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          {data && <p>Displayed amounts are from the last successful calculation.</p>}
          <Button onClick={() => void load()}>Retry / reload spending</Button>
        </div>
      )}
      {loading && <LoadingIndicator role="status">Loading spending…</LoadingIndicator>}
      {data && !loading && data.periodType === period && (!start || data.periodStart === start) && (
        <>
          <h2>
            {data.periodType === "MONTH"
              ? data.periodStart.slice(0, 7)
              : data.periodStart.slice(0, 4)}
          </h2>
          {data.periodStart.slice(0, data.periodType === "MONTH" ? 7 : 4) ===
            data.businessDate.slice(0, data.periodType === "MONTH" ? 7 : 4) && (
            <p className="help">
              Activity through {data.businessDate}. Net spending is expenses minus refunds.
            </p>
          )}
          <label>
            <Checkbox checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all
            categories
          </label>
          {!data.currencies.length && (
            <>
              <p>No expenses or refunds recorded in this period.</p>
              {all && (
                <ul>
                  {data.categories.map((c) => (
                    <li key={c.id}>
                      {c.name}
                      {!c.available ? " (archived branch)" : ""} · No activity
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {data.currencies.map((summary) => {
            return (
              <section key={summary.currency}>
                <h2>{summary.currency}</h2>
                <div className="spending-summary">
                  <p>
                    Expenses: {displayAmount(summary.expenses)} · Refunds:{" "}
                    {displayAmount(summary.refunds)} · Net spending:{" "}
                    <strong>
                      {displayAmount(summary.netSpending)} {summary.currency}
                    </strong>
                  </p>
                  <p>
                    Uncategorized net spending: {displayAmount(summary.uncategorized)}{" "}
                    {summary.currency}
                  </p>
                </div>
                <SpendingHierarchyTable
                  data={data}
                  all={all}
                  activityLoading={activityLoading}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  openActivity={openActivity}
                  summary={summary}
                />
              </section>
            );
          })}
        </>
      )}
      {activityLoading && <LoadingIndicator role="status">Loading activity…</LoadingIndicator>}
      {activity && (
        <section className="panel">
          <h2>
            Activity for {activity.label} · {activity.currency}
          </h2>
          <Button
            onClick={() => {
              ++activityGeneration.current;
              setActivity(undefined);
              setActivityLoading(false);
            }}
          >
            Close activity
          </Button>
          {!activity.items.length && <p>No supporting expenses or refunds.</p>}
          {activity.items.map((o) => (
            <p key={o.id}>
              {o.transactionDate} · {o.kind} · {displayAmount(o.amount)} {o.currency} ·{" "}
              {o.description} · {o.category?.parentName ? `${o.category.parentName} → ` : ""}
              {o.category?.name}
              {o.category && !o.category.available ? " (archived branch)" : ""} ·{" "}
              <Link href={`#/accounts/${o.accountId}`}>Open account</Link>
            </p>
          ))}
          <ActionGroup className="form-actions">
            <Button
              disabled={activityLoading || activity.page === 0}
              onClick={() =>
                void openActivity(
                  activity.categoryId,
                  activity.label,
                  activity.currency,
                  activity.page - 1,
                )
              }
            >
              Previous activity
            </Button>
            <Button
              disabled={activityLoading || !activity.hasMore}
              onClick={() =>
                void openActivity(
                  activity.categoryId,
                  activity.label,
                  activity.currency,
                  activity.page + 1,
                )
              }
            >
              Next activity
            </Button>
          </ActionGroup>
        </section>
      )}
    </>
  );
}
