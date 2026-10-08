import { displayAmount } from "../../../utils/accountPresentation";
import { Button, Checkbox, Input, Link, LoadingIndicator, Select } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";
import { SpendingHierarchyTable } from "./SpendingHierarchyTable";

import type { SpendingPeriod } from "../../../types/models";
import type { SpendingPageViewModel } from "../../../types/viewModels";

export function SpendingPageView({
  period,
  setPeriod,
  start,
  setStart,
  entry,
  setEntry,
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
      <h1>Spending</h1>
      <p>
        See expenses, refunds and net spending by category. Each currency is reported separately.
      </p>
      <ActionGroup className="form-actions spending-toolbar">
        <label>
          Period type{" "}
          <Select
            disabled={loading}
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as SpendingPeriod);
              setStart("");
            }}
          >
            <option value="MONTH">Month</option>
            <option value="YEAR">Year</option>
          </Select>
        </label>
        <Button disabled={loading} onClick={() => move(-1)}>
          Previous period
        </Button>
        <form
          className="form-actions"
          onSubmit={(e) => {
            e.preventDefault();
            setStart(period === "MONTH" ? `${entry}-01` : `${entry.padStart(4, "0")}-01-01`);
          }}
        >
          <label>
            Period{" "}
            <Input
              required
              type={period === "MONTH" ? "month" : "number"}
              min={period === "YEAR" ? "1" : undefined}
              max={period === "YEAR" ? "9999" : "9999-12"}
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
            />
          </label>
          <Button disabled={loading}>Show period</Button>
        </form>
        <Button disabled={loading} onClick={() => move(1)}>
          Next period
        </Button>
        <Button disabled={loading} onClick={() => void load()}>
          Refresh spending
        </Button>
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
