import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { Invitation, IssuedInvitation, RegistrationManagement } from "../../types/models";
export function useRegistrationManagement(onExpired: () => void) {
  const [data, setData] = useState<RegistrationManagement>();
  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<IssuedInvitation>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const fail = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else {
        setError(error instanceof Error ? error.message : "Unable to manage registration.");
        if (error instanceof ApiError && error.status === 412) setStale(true);
      }
    },
    [onExpired],
  );
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await api.registrationManagement());
      setStale(false);
    } catch (error) {
      fail(error);
    } finally {
      setLoading(false);
    }
  }, [fail]);
  useEffect(() => {
    void load();
  }, [load]);
  async function change(operation: () => Promise<void>) {
    setPending(true);
    setError("");
    setIssued(undefined);
    try {
      await operation();
      await load();
    } catch (error) {
      fail(error);
    } finally {
      setPending(false);
    }
  }
  async function toggle(enabled: boolean) {
    if (!data) return;
    const before = data.settings;
    setData({ ...data, settings: { ...before, enabled } });
    await change(async () => {
      try {
        const settings = await api.configureRegistration(before, enabled);
        setData((current) => (current ? { ...current, settings } : current));
      } catch (error) {
        setData((current) => (current ? { ...current, settings: before } : current));
        throw error;
      }
    });
  }
  async function invite() {
    await change(async () => {
      setIssued(await api.invite(email.trim()));
      setEmail("");
    });
  }
  async function replace(item: Invitation) {
    await change(async () => {
      setIssued(await api.replaceInvitation(item));
    });
  }
  async function revoke(item: Invitation) {
    await change(async () => {
      await api.revokeInvitation(item);
    });
  }
  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
    } catch {
      setError("Select the invitation code and copy it manually.");
    }
  }
  return {
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
  };
}
