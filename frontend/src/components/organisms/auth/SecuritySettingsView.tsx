import type { ComponentType } from "react";
import type {
  AuthenticatorStepProps,
  IdentityStepProps,
  RecoveryStepProps,
} from "../../../types/componentProps";
import type { SecuritySettingsViewModel } from "../../../types/viewModels";
import { Badge, Button, LoadingIndicator } from "../../atoms/Controls";
import { ActionGroup } from "../../molecules/ActionGroup";
import { Message } from "../../molecules/Message";
import { WorkspaceHeading } from "../application/WorkspaceHeading";

import { Feedback } from "../../molecules/Feedback";

export function SecuritySettingsView({
  status,
  loadError,
  wizard,
  setWizard,
  notice,
  setNotice,
  action,
  load,
  cancel,
  complete,
  logout,
  verifyIdentity,
  verifyAuthenticator,
  requiredSetup,
  IdentityStep,
  AuthenticatorStep,
  RecoveryStep,
}: SecuritySettingsViewModel & {
  IdentityStep: ComponentType<IdentityStepProps>;
  AuthenticatorStep: ComponentType<AuthenticatorStepProps>;
  RecoveryStep: ComponentType<RecoveryStepProps>;
}) {
  return (
    <>
      <WorkspaceHeading
        title={<>Settings</>}
        subtitle={<>Security</>}
        actions={
          <>
            <Button variant="secondary" disabled={action.pending} onClick={logout}>
              Sign out
            </Button>
          </>
        }
      />
      {requiredSetup && (
        <Message role="status" className="notice">
          Set up two-factor authentication before accessing your financial accounts.
        </Message>
      )}
      {notice && (
        <Message role="status" className="notice">
          {notice}
        </Message>
      )}
      {loadError ? (
        <div role="alert" className="error">
          <p>{loadError}</p>
          <Button onClick={() => void load()}>Retry settings</Button>
        </div>
      ) : !status ? (
        <LoadingIndicator role="status">Loading security settings…</LoadingIndicator>
      ) : (
        <section className="panel">
          <div className="section-heading">
            <h2>Two-factor authentication</h2>
            <Badge className="security-badge">{status.enabled ? "Enabled" : "Not enabled"}</Badge>
          </div>
          <p>
            {status.required
              ? "Two-factor authentication is required in this environment."
              : "Two-factor authentication is optional in development. Once enabled, it is required at every sign-in."}
          </p>
          {status.enabled && <p>{status.recoveryCodesRemaining} recovery codes remaining.</p>}
          {!wizard && status.pendingOperation && (
            <p className="notice">
              A setup operation is unfinished. Start again to get a fresh key or recovery codes;
              previously shown pending codes cannot be redisplayed.
            </p>
          )}
          {!wizard && (
            <ActionGroup className="form-actions">
              {status.enabled ? (
                <>
                  <Button
                    onClick={() => {
                      setWizard({ operation: "REPLACE", step: "identity" });
                      setNotice(null);
                    }}
                  >
                    Replace authenticator
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setWizard({ operation: "RECOVERY", step: "identity" });
                      setNotice(null);
                    }}
                  >
                    Generate new recovery codes
                  </Button>
                </>
              ) : (
                <Button onClick={() => setWizard({ operation: "ENROLL", step: "identity" })}>
                  Set up 2FA
                </Button>
              )}
            </ActionGroup>
          )}
          {wizard && (
            <div className="mfa-wizard">
              <h3>
                {wizard.operation === "ENROLL"
                  ? "Activate 2FA"
                  : wizard.operation === "REPLACE"
                    ? "Replace authenticator"
                    : "Generate new recovery codes"}
              </h3>
              {wizard.step === "identity" && (
                <IdentityStep
                  existing={status.enabled}
                  disabled={action.disabled}
                  onSubmit={verifyIdentity}
                />
              )}
              {wizard.step === "authenticator" && wizard.setup && (
                <AuthenticatorStep
                  setup={wizard.setup}
                  disabled={action.disabled}
                  onSubmit={verifyAuthenticator}
                />
              )}
              {wizard.step === "codes" && wizard.codes && (
                <RecoveryStep
                  codes={wizard.codes}
                  disabled={action.disabled}
                  label={wizard.operation === "ENROLL" ? "Activate 2FA" : "Confirm security change"}
                  onConfirm={() => void action.run(complete)}
                />
              )}
              <Button
                variant="secondary"
                disabled={action.pending}
                onClick={() => void action.run(cancel)}
              >
                Cancel setup
              </Button>
              {wizard.operation !== "ENROLL" && (
                <p className="help">
                  Your current authenticator and unused recovery codes stay active until you confirm
                  this change.
                </p>
              )}
            </div>
          )}
          <Feedback action={action} />
        </section>
      )}
    </>
  );
}
