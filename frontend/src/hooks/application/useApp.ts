import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "../../services/api";
import type { Session } from "../../types/models";

function currentPage() {
  const hash = window.location.hash;
  if (hash === "#/register") return "register";
  if (hash === "#/expected") return "expected";
  return hash === "#/planning" || hash === "#/spending"
    ? "spending"
    : hash.split("?")[0] === "#/categories"
      ? "categories"
      : hash === "#/settings"
        ? "settings"
        : hash === "#/accounts" || hash.startsWith("#/accounts/")
          ? "accounts"
          : "net-worth";
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function useApp() {
  const [page, setPage] = useState(currentPage);
  useEffect(() => {
    const change = () => setPage(currentPage());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const restore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSession(await api.session());
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSession(null);
      else setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void restore();
  }, [restore]);
  const expire = useCallback(() => {
    setSession(null);
    setNotice("Your session expired. Please sign in again.");
    setLogoutError(null);
  }, []);
  function acceptSession(result: Session) {
    setSession(result);
    if (window.location.hash === "#/register") {
      setPage("net-worth");
      window.location.hash = "#/net-worth";
    }
    setNotice(null);
    setLogoutError(null);
    if (result.status === "AUTHENTICATED" && result.recoveryUsed) {
      setPage("settings");
      window.location.hash = "#/settings";
    }
  }
  const loggedOut = () => {
    setSession(null);
    setNotice(null);
    setLogoutError(null);
    setPage("net-worth");
    window.location.hash = "#/net-worth";
  };

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await api.logout();
      loggedOut();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) loggedOut();
      else setLogoutError(errorMessage(err));
    } finally {
      setLoggingOut(false);
    }
  }

  return {
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
  };
}
