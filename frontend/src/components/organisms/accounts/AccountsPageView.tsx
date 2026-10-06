import { Button, LoadingIndicator } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";
import { Confirmation } from "../../molecules/Confirmation";
import { Message } from "../../molecules/Message";
import { WorkspaceHeading } from "../application/WorkspaceHeading";

import { accountTypes, displayAmount } from "../../../utils/accountPresentation";

import type { ComponentType } from "react";
import type { AccountFormProps } from "../../../types/componentProps";
import type { AccountsPageViewModel } from "../../../types/viewModels";

export function AccountsPageView({
  setSelected,
  accounts,
  setAccounts,
  loading,
  error,
  showForm,
  setShowForm,
  editing,
  setEditing,
  archived,
  setArchived,
  deleting,
  setDeleting,
  actionPending,
  actionError,
  setActionError,
  stale,
  setStale,
  visibleAccounts,
  manage,
  loggingOut,
  notice,
  setNotice,
  load,
  logout,
  user,
  onExpired,
  AccountForm,
}: AccountsPageViewModel & {
  AccountForm: ComponentType<AccountFormProps>;
}) {
  return (
    <>
      <WorkspaceHeading
        title={<>Accounts</>}
        subtitle={<>{user.email}</>}
        actions={
          <>
            <Button variant="secondary" disabled={loggingOut} onClick={() => void logout()}>
              {loggingOut ? "Signing out…" : "Sign out"}
            </Button>
          </>
        }
      />
      <div className="section-heading">
        <p>Keep track of where your money lives.</p>
        <Button
          disabled={showForm || actionPending || loggingOut || loading || !!error}
          onClick={() => {
            setEditing(undefined);
            setShowForm(true);
            setNotice(null);
          }}
        >
          Create account
        </Button>
      </div>
      <div className="account-filter" role="group" aria-label="Account status">
        <Button
          variant="secondary"
          aria-pressed={!archived}
          disabled={showForm || actionPending}
          onClick={() => setArchived(false)}
        >
          Active accounts
        </Button>
        <Button
          variant="secondary"
          aria-pressed={archived}
          disabled={showForm || actionPending}
          onClick={() => setArchived(true)}
        >
          Archived accounts
        </Button>
      </div>
      {notice && (
        <Message role="status" className="notice">
          {notice}
        </Message>
      )}
      {actionError && (
        <div role="alert" className="error">
          <p>{actionError}</p>
          {stale && (
            <Button
              onClick={() => {
                setDeleting(null);
                setActionError(null);
                void load();
              }}
            >
              Reload accounts
            </Button>
          )}
        </div>
      )}
      {deleting && (
        <Confirmation
          className="panel"
          aria-labelledby="delete-heading"
          titleId="delete-heading"
          title={<>Delete {deleting.name}?</>}
        >
          <p>This permanently removes the account. Its audit history is retained.</p>
          <ActionGroup className="form-actions">
            <Button
              disabled={actionPending || stale}
              onClick={() => void manage(deleting, "delete")}
            >
              Confirm deletion
            </Button>
            <Button
              variant="secondary"
              disabled={actionPending}
              onClick={() => {
                setDeleting(null);
                setActionError(null);
              }}
            >
              Cancel deletion
            </Button>
          </ActionGroup>
        </Confirmation>
      )}
      {showForm && (
        <AccountForm
          account={editing}
          onCancel={() => {
            setShowForm(false);
            if (editing) void load();
          }}
          onExpired={onExpired}
          onCreated={(account) => {
            setAccounts((existing) =>
              editing
                ? existing.map((item) => (item.id === account.id ? account : item))
                : [account, ...existing],
            );
            setShowForm(false);
            setNotice(`${account.name} ${editing ? "updated" : "created"}.`);
            setEditing(undefined);
            if (!editing) setArchived(false);
          }}
        />
      )}
      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => void load()}>
            Reload accounts
          </Button>
        </div>
      )}
      {loading ? (
        <LoadingIndicator role="status">Loading accounts…</LoadingIndicator>
      ) : !error && visibleAccounts.length === 0 ? (
        <section className="panel empty-state">
          <h2>
            {archived
              ? "No archived accounts"
              : accounts.length
                ? "No active accounts"
                : "Your first account starts here"}
          </h2>
          <p>
            {archived
              ? "Archived accounts will appear here. You can restore them at any time."
              : "Add a bank account, cash balance, credit card, or investment account."}
          </p>
          {!archived && (
            <Button
              disabled={showForm}
              onClick={() => {
                setEditing(undefined);
                setShowForm(true);
              }}
            >
              Create your first account
            </Button>
          )}
        </section>
      ) : (
        <div className="account-grid">
          {visibleAccounts.map((account) => {
            const balance = account.currentBalance ?? account.openingBalance;
            const owed = account.type === "CREDIT_CARD" && balance.startsWith("-");
            return (
              <article className="panel account-card" key={account.id}>
                <p className="eyebrow">{accountTypes[account.type]}</p>
                <h2>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      window.location.hash = `#/accounts/${account.id}`;
                      setSelected(account.id);
                    }}
                  >
                    {account.name}
                  </Button>
                </h2>
                {account.institution && <p className="muted">{account.institution}</p>}
                <p className="balance">
                  {account.currency} {displayAmount(owed ? balance.slice(1) : balance)}
                </p>
                <p className="muted">
                  {account.currentBalance ? "Current" : "Opening"}{" "}
                  {owed
                    ? "amount owed"
                    : account.type === "INVESTMENT"
                      ? "cash balance"
                      : "balance"}{" "}
                  ·{" "}
                  <time dateTime={account.balanceAsOf ?? account.openingDate}>
                    {account.balanceAsOf ?? account.openingDate}
                  </time>
                </p>
                {!account.active && <p className="muted">Archived</p>}
                <ActionGroup className="form-actions">
                  <Button
                    variant="secondary"
                    disabled={showForm || actionPending || !!deleting}
                    onClick={() => {
                      setEditing(account);
                      setShowForm(true);
                      setNotice(null);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={showForm || actionPending || !!deleting}
                    onClick={() => void manage(account, account.active ? "archive" : "restore")}
                  >
                    {account.active ? "Archive" : "Restore"}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={showForm || actionPending || !!deleting || account.hasActivity}
                    onClick={() => {
                      setDeleting(account);
                      setActionError(null);
                      setStale(false);
                    }}
                  >
                    Delete
                  </Button>
                </ActionGroup>
                {account.hasActivity && (
                  <p className="help">
                    Financial history is preserved. Archive this account instead of deleting it.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
