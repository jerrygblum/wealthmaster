import type { ComponentProps } from "react";
import type { ExpectedPageViewModel } from "../../../types/viewModels";
import { categoryLabel } from "../../../utils/categoryPresentation";
import { displayAmount } from "../../../utils/accountPresentation";
import { ActionIcon } from "../../atoms/ActionIcon";
import { Button, Checkbox, Input, Link, LoadingIndicator } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";
import { Confirmation } from "../../molecules/Confirmation";
import { WorkspaceHeading } from "../application/WorkspaceHeading";
import { ExpectedFormView, ExpectedRecordForm } from "./ExpectedFormView";

function IconAction({
  label,
  action,
  ...props
}: ComponentProps<typeof Button> & {
  label: string;
  action: ComponentProps<typeof ActionIcon>["action"];
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      className="compact-action"
      aria-label={label}
      title={label}
      {...props}
    >
      <ActionIcon action={action} />
    </Button>
  );
}
const statuses = {
  UPCOMING: "Upcoming",
  DUE: "Due today",
  OVERDUE: "Overdue",
  SCHEDULED: "Scheduled",
  COMPLETED: "Completed",
  SKIPPED: "Skipped",
  NEEDS_REVIEW: "Needs review",
};
const kinds = { INCOME: "Income", EXPENSE: "Expense", TRANSFER: "Transfer" };

export function ExpectedPageView(model: ExpectedPageViewModel) {
  const {
    report,
    accounts,
    categories,
    loading,
    pending,
    error,
    stale,
    form,
    recordForm,
    deleting,
    selected,
    candidates,
    candidateLoading,
    shownMonth,
    showAll,
    setShowAll,
    selectMonth,
    move,
    start,
    setDeleting,
    close,
    load,
    remove,
    suggestions,
    record,
    reconcile,
  } = model;
  const editing = !!form || !!recordForm || !!deleting || !!selected;
  const disabled = pending || loading || editing;
  const name = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "Account";
  return (
    <>
      <WorkspaceHeading
        title="Expected"
        actions={
          <IconAction
            label="Add recurring item"
            action="add"
            disabled={disabled || !report}
            onClick={() => start()}
          />
        }
      />
      <p className="workspace-description">
        Monthly income, expenses and transfers. Expectations affect balances only when actual
        activity is recorded.
      </p>
      <ActionGroup className="workspace-toolbar expected-toolbar">
        <IconAction
          label="Previous month"
          action="previous"
          disabled={disabled || !shownMonth || shownMonth === "0001-01"}
          onClick={() => move(-1)}
        />
        <label className="period-field">
          <span className="sr-only">Expected month</span>
          <Input
            type="month"
            min="0001-01"
            max="9999-12"
            value={shownMonth}
            disabled={disabled}
            onChange={(e) => selectMonth(e.target.value)}
          />
        </label>
        <IconAction
          label="Next month"
          action="next"
          disabled={disabled || !shownMonth || shownMonth === "9999-12"}
          onClick={() => move(1)}
        />
      </ActionGroup>
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          {report && <p>Displayed expectations are from the last successful load.</p>}
          <Button
            disabled={pending}
            onClick={() => {
              close();
              void load();
            }}
          >
            Cancel / reload expectations
          </Button>
        </div>
      )}
      {loading && <LoadingIndicator role="status">Loading expectations…</LoadingIndicator>}
      <ExpectedFormView {...model} />
      <ExpectedRecordForm {...model} />
      {deleting && (
        <Confirmation className="panel" title={`Delete ${deleting.name}?`}>
          <p>
            This removes its expectations from all months and releases confirmed links. Actual
            transactions and audit history are retained. Set a last month instead to preserve
            earlier expectations.
          </p>
          <Button disabled={pending || stale} onClick={() => void remove()}>
            Confirm deletion
          </Button>
          <Button variant="secondary" disabled={pending} onClick={close}>
            Cancel deletion
          </Button>
        </Confirmation>
      )}
      {selected && !recordForm && (
        <section className="panel expected-editor">
          <h2>Match {selected.definition.name}</h2>
          <p className="help">
            Suggestions use this month, type, currency and accounts. Exact amounts come first;
            confirm the correct transaction.
          </p>
          {candidateLoading ? (
            <LoadingIndicator role="status">Loading suggestions…</LoadingIndicator>
          ) : (
            candidates && (
              <>
                {!candidates.items.length && (
                  <p>No available matching transactions in this month.</p>
                )}
                <ul className="expected-candidates">
                  {candidates.items.map((op) => (
                    <li key={op.id}>
                      <span>
                        {op.transactionDate} · {op.description} · {op.payee} ·{" "}
                        {displayAmount(op.amount)} {op.currency}
                      </span>
                      <Link href={`#/accounts/${op.accountId}`}>Account activity</Link>
                      <Button
                        disabled={pending || stale}
                        onClick={() => void reconcile(selected, op)}
                      >
                        Confirm match
                      </Button>
                    </li>
                  ))}
                </ul>
                <ActionGroup>
                  <IconAction
                    label="Previous suggestions"
                    action="previous"
                    disabled={pending || candidates.page === 0}
                    onClick={() => void suggestions(selected, candidates.page - 1)}
                  />
                  <span>Page {candidates.page + 1}</span>
                  <IconAction
                    label="Next suggestions"
                    action="next"
                    disabled={pending || !candidates.hasMore}
                    onClick={() => void suggestions(selected, candidates.page + 1)}
                  />
                </ActionGroup>
              </>
            )
          )}
          <Button variant="secondary" disabled={pending} onClick={close}>
            Close suggestions
          </Button>
        </section>
      )}
      {report && !loading && (!shownMonth || report.month.slice(0, 7) === shownMonth) && (
        <>
          <div className="expected-totals">
            {report.totals.map((t) => (
              <p key={`${t.currency}-${t.kind}`}>
                <strong>
                  {t.currency} {kinds[t.kind]}
                </strong>{" "}
                · Expected {displayAmount(t.expected)} · Completed {displayAmount(t.completed)} ·
                Actual {displayAmount(t.actual)} · Outstanding {displayAmount(t.outstanding)}
              </p>
            ))}
          </div>
          {!report.items.length ? (
            <p>No expected items in this month. Add a recurring item to get started.</p>
          ) : (
            <table className="expected-table">
              <caption className="sr-only">
                Expected activity for {report.month.slice(0, 7)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Item / account</th>
                  <th scope="col">Due</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Actual / difference</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item) => {
                  const d = item.definition;
                  const c = categories.find((c) => c.id === d.categoryId);
                  return (
                    <tr key={d.id}>
                      <th scope="row" data-label="Item">
                        <strong>{d.name}</strong>
                        <span className="help">
                          {kinds[d.kind]} ·{" "}
                          <Link href={`#/accounts/${d.accountId}`}>{name(d.accountId)}</Link>
                          {d.destinationAccountId && (
                            <>
                              {" "}
                              →{" "}
                              <Link href={`#/accounts/${d.destinationAccountId}`}>
                                {name(d.destinationAccountId)}
                              </Link>
                            </>
                          )}
                          {c && <> · {categoryLabel(c, categories)}</>}
                        </span>
                        {!d.available && (
                          <span className="help">
                            Archived reference; restore it to record activity.
                          </span>
                        )}
                      </th>
                      <td data-label="Due">{item.expectedDate}</td>
                      <td data-label="Expected">
                        {displayAmount(d.amount)} {d.currency}
                      </td>
                      <td data-label="Actual / difference">
                        {item.actual ? (
                          <>
                            <Link href={`#/accounts/${item.actual.accountId}`}>
                              {displayAmount(item.actual.amount)} {item.actual.currency}
                            </Link>
                            <span className="help">Recorded {item.actual.transactionDate}</span>
                            <span className="help">
                              {item.difference === null
                                ? "Currency changed"
                                : `Difference ${displayAmount(item.difference)} ${d.currency}`}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="Status">{statuses[item.status]}</td>
                      <td data-label="Actions">
                        <ActionGroup className="expected-actions">
                          <IconAction
                            label={`Edit ${d.name}`}
                            action="edit"
                            disabled={disabled}
                            onClick={() => start(d)}
                          />
                          <IconAction
                            label={`Delete ${d.name}`}
                            action="delete"
                            disabled={disabled}
                            onClick={() => setDeleting(d)}
                          />
                          {item.status !== "SKIPPED" && (
                            <IconAction
                              label={`Match ${d.name}`}
                              action="link"
                              disabled={disabled}
                              onClick={() => void suggestions(item)}
                            />
                          )}
                          {(item.actual || item.status === "NEEDS_REVIEW") && (
                            <IconAction
                              label={`Unlink ${d.name}`}
                              action="unlink"
                              disabled={disabled}
                              onClick={() => void reconcile(item)}
                            />
                          )}
                          {item.canRecord && (
                            <IconAction
                              label={`Record ${d.name}`}
                              action="record"
                              disabled={disabled}
                              onClick={() => record(item)}
                            />
                          )}
                          {!item.actual && item.status !== "NEEDS_REVIEW" && (
                            <IconAction
                              label={`${item.status === "SKIPPED" ? "Undo skip" : "Skip"} ${d.name}`}
                              action={item.status === "SKIPPED" ? "restore" : "skip"}
                              disabled={disabled}
                              onClick={() =>
                                void reconcile(item, undefined, item.status !== "SKIPPED")
                              }
                            />
                          )}
                        </ActionGroup>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <label className="checkbox-label">
            <Checkbox checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Manage all
            recurring items
          </label>
          {showAll && (
            <ul className="expected-definitions">
              {report.definitions.map((d) => (
                <li key={d.id}>
                  <span>
                    {d.name} · {kinds[d.kind]} · {displayAmount(d.amount)} {d.currency} ·{" "}
                    {d.firstMonth.slice(0, 7)} – {d.lastMonth?.slice(0, 7) ?? "ongoing"}
                  </span>
                  <IconAction
                    label={`Edit schedule ${d.name}`}
                    action="edit"
                    disabled={disabled}
                    onClick={() => start(d)}
                  />
                  <IconAction
                    label={`Delete schedule ${d.name}`}
                    action="delete"
                    disabled={disabled}
                    onClick={() => setDeleting(d)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
