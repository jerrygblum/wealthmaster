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
}: {
  children: ReactNode;
  page: string;
  authenticated: boolean;
  recoveryUsed: boolean;
}) {
  return (
    <AppShell>
      <Brand />
      {authenticated && <WorkspaceNavigation page={page} />}{" "}
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
