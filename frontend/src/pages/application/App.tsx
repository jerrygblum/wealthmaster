import { ActionIcon } from "../../components/atoms/ActionIcon";
import { Button, LoadingIndicator } from "../../components/atoms/Controls";
import { ApplicationLayout } from "../../components/templates/ApplicationLayout";
import { AuthenticationLayout } from "../../components/templates/AuthenticationLayout";
import { useApp } from "../../hooks/application/useApp";
import { AccountsPage } from "../accounts/AccountsPage";
import { LoginPage } from "../auth/LoginPage";
import { MfaLogin } from "../auth/MfaLogin";
import { SecuritySettings } from "../auth/SecuritySettings";
import { CategoriesPage } from "../categories/CategoriesPage";
import { NetWorthPage } from "../networth/NetWorthPage";
import { SpendingPage } from "../spending/SpendingPage";

export default function App() {
  const model = useApp();
  const {
    page,
    session,
    loading,
    error,
    notice,
    restore,
    expire,
    acceptSession,
    loggedOut,
    logout,
    loggingOut,
    logoutError,
  } = model;
  return (
    <ApplicationLayout
      page={page}
      authenticated={session?.status === "AUTHENTICATED"}
      recoveryUsed={session?.status === "AUTHENTICATED" && !!session.recoveryUsed}
      headerActions={
        session && session.status !== "MFA_REQUIRED" ? (
          <Button
            variant="secondary"
            className="compact-action"
            aria-label="Sign out"
            title="Sign out"
            aria-busy={loggingOut}
            disabled={loading || loggingOut}
            onClick={() => void logout()}
          >
            <ActionIcon action="logout" />
          </Button>
        ) : null
      }
      headerFeedback={
        logoutError && (
          <p className="error" role="alert">
            {logoutError}
          </p>
        )
      }
    >
      {loading ? (
        <AuthenticationLayout className="center-card">
          <LoadingIndicator role="status">Checking your session…</LoadingIndicator>
        </AuthenticationLayout>
      ) : error ? (
        <AuthenticationLayout className="center-card">
          <h1>Let’s reconnect</h1>
          <p role="alert">{error}</p>
          <Button onClick={() => void restore()}>Try again</Button>
        </AuthenticationLayout>
      ) : session?.status === "MFA_SETUP_REQUIRED" ||
        (session?.status === "AUTHENTICATED" && page === "settings") ? (
        <SecuritySettings
          requiredSetup={session.status === "MFA_SETUP_REQUIRED"}
          onSession={acceptSession}
          onExpired={expire}
        />
      ) : session?.status === "AUTHENTICATED" && page === "spending" ? (
        <SpendingPage onExpired={expire} />
      ) : session?.status === "AUTHENTICATED" && page === "categories" ? (
        <CategoriesPage user={session.user} onExpired={expire} />
      ) : session?.status === "AUTHENTICATED" && page === "net-worth" ? (
        <NetWorthPage user={session.user} onExpired={expire} />
      ) : session?.status === "AUTHENTICATED" ? (
        <AccountsPage user={session.user} onExpired={expire} />
      ) : session?.status === "MFA_REQUIRED" ? (
        <MfaLogin onSession={acceptSession} onExpired={expire} onLogout={loggedOut} />
      ) : (
        <LoginPage notice={notice} onLogin={acceptSession} />
      )}
    </ApplicationLayout>
  );
}
