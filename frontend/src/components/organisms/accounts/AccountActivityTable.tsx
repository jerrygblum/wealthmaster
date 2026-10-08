import type { AccountDetailViewModel } from "../../../types/viewModels";
import { displayAmount } from "../../../utils/accountPresentation";
import { ActionIcon } from "../../atoms/ActionIcon";
import { Button, Link } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";

export function AccountActivityTable({
  account,
  items,
  accounts,
  id,
  canChange,
  pending,
  form,
  deleting,
  start,
  setDeleting,
  setStale,
  setError,
}: Pick<
  AccountDetailViewModel,
  | "account"
  | "items"
  | "accounts"
  | "id"
  | "canChange"
  | "pending"
  | "form"
  | "deleting"
  | "start"
  | "setDeleting"
  | "setStale"
  | "setError"
>) {
  return (
    <div className="activity-table">
      <table>
        <caption className="sr-only">Account transactions</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Transaction</th>
            <th scope="col">Category / transfer</th>
            <th scope="col">Amount</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((op) => {
            const transfer = op.kind === "TRANSFER";
            const counterpart = transfer
              ? op.accountId === id
                ? op.destinationAccountId
                : op.accountId
              : undefined;
            const kind = transfer
              ? op.accountId === id
                ? "Transfer out"
                : "Transfer in"
              : { INCOME: "Income", EXPENSE: "Expense", REFUND: "Refund" }[
                  op.kind as "INCOME" | "EXPENSE" | "REFUND"
                ];
            const disabled = !canChange(op) || pending || !!form || !!deleting;
            return (
              <tr key={op.id}>
                <td className="activity-date" data-label="Date">
                  {op.transactionDate}
                  {op.valueDate && (
                    <span className="activity-meta">Value date: {op.valueDate}</span>
                  )}
                </td>
                <th scope="row" className="activity-description">
                  <strong>{op.description}</strong>
                  <span className="activity-meta">
                    {kind}
                    {account?.balanceAsOf &&
                      op.transactionDate > account.balanceAsOf &&
                      " · Scheduled"}
                    {op.payee && ` · ${op.payee}`}
                  </span>
                  {op.notes && (
                    <details className="activity-notes">
                      <summary>Notes</summary>
                      <p>{op.notes}</p>
                    </details>
                  )}
                  {!canChange(op) && (
                    <span className="activity-meta">
                      Read-only; restore affected accounts to edit.
                    </span>
                  )}
                </th>
                <td className="activity-category" data-label="Category / transfer">
                  {transfer ? (
                    <>
                      {op.accountId === id ? "To" : "From"}{" "}
                      <Link href={`#/accounts/${counterpart}`}>
                        {accounts.find((a) => a.id === counterpart)?.name ?? "Account"}
                      </Link>
                    </>
                  ) : (
                    <span>
                      Category:{" "}
                      {op.category
                        ? `${op.category.parentName ? `${op.category.parentName} → ` : ""}${op.category.name}${!op.category.available ? " (archived)" : ""}`
                        : "Uncategorized"}
                    </span>
                  )}
                </td>
                <td className="activity-amount" data-label="Amount">
                  {op.currency} {displayAmount(op.amount)}
                </td>
                <td className="activity-actions">
                  <ActionGroup>
                    <Button
                      variant="secondary"
                      className="compact-action"
                      aria-label="Edit entry"
                      title={`Edit ${op.description}`}
                      disabled={disabled}
                      onClick={() => start(op.kind, op)}
                    >
                      <ActionIcon action="edit" />
                    </Button>
                    <Button
                      variant="secondary"
                      className="compact-action compact-action-delete"
                      aria-label="Delete entry"
                      title={`Delete ${op.description}`}
                      disabled={disabled}
                      onClick={() => {
                        setDeleting(op);
                        setStale(false);
                        setError("");
                      }}
                    >
                      <ActionIcon action="delete" />
                    </Button>
                  </ActionGroup>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
