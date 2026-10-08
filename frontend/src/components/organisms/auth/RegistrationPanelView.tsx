import { ActionIcon } from "../../atoms/ActionIcon";
import { Button, Input, LoadingIndicator } from "../../atoms/Controls";
import { Field } from "../../molecules/Field";
import { ActionGroup } from "../../molecules/ActionGroup";
import type { RegistrationPanelViewModel } from "../../../types/viewModels";
export function RegistrationPanelView(model: RegistrationPanelViewModel) {
  const {
    data,
    email,
    setEmail,
    issued,
    setIssued,
    pending,
    error,
    loading,
    stale,
    load,
    toggle,
    invite,
    replace,
    revoke,
    copy,
  } = model;
  return (
    <section className="panel" aria-labelledby="registration-settings-heading">
      <h2 id="registration-settings-heading">Registration</h2>
      <p className="help">
        Only people with an invitation for their exact email can register. Disabling registration
        keeps existing accounts available.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {loading && !data ? (
        <LoadingIndicator>Loading registration settings…</LoadingIndicator>
      ) : !data ? (
        <Button onClick={() => void load()}>Retry registration settings</Button>
      ) : (
        <>
          <label className="checkbox-label">
            <Input
              type="checkbox"
              checked={data.settings.enabled}
              disabled={pending || stale || loading}
              onChange={(e) => void toggle(e.target.checked)}
            />{" "}
            Allow invited users to register
          </label>
          {stale && (
            <p role="status">
              Reload settings before making another change.{" "}
              <Button variant="secondary" onClick={() => void load()}>
                Reload registration settings
              </Button>
            </p>
          )}
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void invite();
            }}
          >
            <fieldset disabled={pending || stale || loading} className="form-grid form-wide">
              <Field htmlFor="invite-email" label="Invite email">
                <Input
                  id="invite-email"
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <ActionGroup>
                <Button
                  type="submit"
                  className="compact-action"
                  aria-label="Create invitation"
                  title="Create invitation"
                >
                  <ActionIcon action="add" />
                </Button>
              </ActionGroup>
            </fieldset>
          </form>
          {data.invitations.length === 0 ? (
            <p>No invitations yet.</p>
          ) : (
            <table className="registration-table">
              <caption className="sr-only">Email invitations</caption>
              <thead>
                <tr>
                  <th scope="col">Email</th>
                  <th scope="col">Status</th>
                  <th scope="col">Expires</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.invitations.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Email">{item.email}</td>
                    <td data-label="Status">
                      {
                        { ACTIVE: "Active", EXPIRED: "Expired", REVOKED: "Revoked", USED: "Used" }[
                          item.status
                        ]
                      }
                    </td>
                    <td data-label="Expires">{new Date(item.expiresAt).toLocaleString()}</td>
                    <td data-label="Actions">
                      <ActionGroup>
                        {item.status !== "USED" && (
                          <Button
                            variant="secondary"
                            className="compact-action"
                            disabled={pending || stale || loading}
                            aria-label={`Replace invitation for ${item.email}`}
                            title="Replace invitation code"
                            onClick={() => void replace(item)}
                          >
                            <ActionIcon action="refresh" />
                          </Button>
                        )}
                        {item.status === "ACTIVE" && (
                          <Button
                            variant="secondary"
                            className="compact-action"
                            disabled={pending || stale || loading}
                            aria-label={`Revoke invitation for ${item.email}`}
                            title="Revoke invitation"
                            onClick={() => void revoke(item)}
                          >
                            <ActionIcon action="delete" />
                          </Button>
                        )}
                      </ActionGroup>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
      {issued && (
        <div className="notice" role="status">
          <p>
            Invitation for {issued.invitation.email}. Copy this code now; it cannot be shown again.
            Send it privately with the registration page address. It expires in seven days.
          </p>
          <Field htmlFor="issued-invitation-code" label="Invitation code">
            <Input
              id="issued-invitation-code"
              readOnly
              value={issued.code}
              onFocus={(e) => e.currentTarget.select()}
            />
          </Field>
          <ActionGroup>
            <Button
              variant="secondary"
              className="compact-action"
              title="Copy invitation code"
              aria-label="Copy invitation code"
              onClick={() => void copy()}
            >
              <ActionIcon action="copy" />
            </Button>
            <Button
              variant="secondary"
              className="compact-action"
              title="Dismiss invitation code"
              aria-label="Dismiss invitation code"
              onClick={() => setIssued(undefined)}
            >
              <ActionIcon action="delete" />
            </Button>
          </ActionGroup>
        </div>
      )}
    </section>
  );
}
