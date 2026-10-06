import { displayAmount } from "../../../utils/accountPresentation";
import { nonzero, zero } from "../../../utils/spendingPresentation";
import { Button, Checkbox, Input, Link, LoadingIndicator, Select } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";
import { ExpensesChart } from "./ExpensesChart";
import { SpendingHierarchyTable } from "./SpendingHierarchyTable";

import type { BudgetPeriod } from "../../../types/models";
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
        Category limits apply to every period. Monthly and yearly allowances are linked; refunds
        reduce spending. Manage limits in Categories.
      </p>
      <p className="help">
        {data?.defaultCurrency
          ? `Default currency: ${data.defaultCurrency}. `
          : "Choose a default currency in Settings before enabling limits. "}
        Foreign-currency spending is not converted and is excluded from default-currency limit
        comparisons. Each currency is reported separately.
      </p>
      <ActionGroup className="form-actions spending-toolbar">
        <label>
          Period type{" "}
          <Select
            disabled={loading}
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value as BudgetPeriod);
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
          <label>
            <Checkbox checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all
            categories
          </label>
          {!data.currencies.length && (
            <>
              <p>No spending or limits recorded in this period.</p>
              {all && (
                <ul>
                  {data.categories.map((c) => (
                    <li key={c.id}>
                      {c.name}
                      {!c.available ? " (archived branch)" : ""} · No activity or limits
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {data.currencies.map((summary) => {
            const amount = (id: string | null, direct = false) => {
              const group = data.groups.find(
                (g) => g.currency === summary.currency && g.categoryId === id,
              );
              return (direct ? group?.direct : group?.inclusive) || zero;
            };
            const slices = [
              ...data.categories
                .filter((c) => !c.parentId)
                .map((c) => ({ id: c.id, label: c.name, value: amount(c.id).expenses })),
              { id: null, label: "Uncategorized", value: amount(null).expenses },
            ].filter((s) => nonzero(s.value));
            const branchId = (id: string | null) =>
              `spending-${summary.currency}-${id || "uncategorized"}`;

            return (
              <section key={summary.currency}>
                <h2>{summary.currency}</h2>
                <div className="spending-summary">
                  <p>
                    Expenses: {displayAmount(summary.expenses)} · Refunds:{" "}
                    {displayAmount(summary.refunds)} · Net spending:{" "}
                    {displayAmount(summary.netSpending)} {summary.currency}
                  </p>
                  <p>
                    Uncategorized net spending: {displayAmount(summary.uncategorized)} · Without an
                    applicable budget: {displayAmount(summary.unbudgeted)} {summary.currency}
                  </p>
                </div>
                <div className="spending-chart-section">
                  <h3>Expenses before refunds</h3>
                  <ExpensesChart
                    currency={summary.currency}
                    slices={slices}
                    onSelect={(id) => {
                      if (id) setExpanded((ids) => (ids.includes(id) ? ids : [...ids, id]));
                      requestAnimationFrame(() => {
                        document.getElementById(branchId(id))?.focus();
                        document.getElementById(branchId(id))?.scrollIntoView({ block: "nearest" });
                      });
                    }}
                  />
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
