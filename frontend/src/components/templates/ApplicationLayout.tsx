import type { ReactNode } from "react";
import { Brand } from "../molecules/Brand";
import { Message } from "../molecules/Message";
import { WorkspaceNavigation } from "../organisms/application/WorkspaceNavigation";
import { AppShell } from "./AppShell";
export function ApplicationLayout({
  children,
  page,
  authenticated,
  recoveryUsed,
  headerActions,
  headerFeedback,
  demo = false,
  nextResetAt,
}: {
  children: ReactNode;
  page: string;
  authenticated: boolean;
  recoveryUsed: boolean;
  headerActions?: ReactNode;
  headerFeedback?: ReactNode;
  demo?: boolean;
  nextResetAt?: string | null;
}) {
  return (
    <AppShell>
      <header className="application-header">
        <Brand />
        {headerActions}
      </header>
      {headerFeedback}
      {authenticated && <WorkspaceNavigation page={page} demo={demo} />}{" "}
      {demo && (
        <Message className="notice" role="status">
          <strong>Shared editable demo.</strong> Use fictional information only. Everyone sees your
          changes.
          {nextResetAt && (
            <>
              {" "}
              Scheduled reset:{" "}
              {new Date(nextResetAt).toLocaleString(undefined, { timeZone: "Europe/Zurich" })}{" "}
              (Europe/Zurich).
            </>
          )}{" "}
          Uploads, security settings and online market requests are unavailable.
        </Message>
      )}
      {recoveryUsed && (
        <Message className="notice">
          You signed in with a recovery code. Review your authenticator and remaining recovery codes
          in settings.
        </Message>
      )}
      {children}
    </AppShell>
  );
}
