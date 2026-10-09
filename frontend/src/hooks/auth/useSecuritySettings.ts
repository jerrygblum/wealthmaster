import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../../services/api";
import type { SecuritySettingsProps } from "../../types/componentProps";
import type {
  FactorKind,
  MfaOperation,
  MfaSetup,
  RecoveryCodes,
  SecurityStatus,
} from "../../types/models";
import { useSecurityAction } from "./useSecurityAction";
type Wizard = {
  operation: MfaOperation;
  step: "identity" | "authenticator" | "codes";
  setup?: MfaSetup;
  codes?: RecoveryCodes;
};
export function useSecuritySettings({
  requiredSetup,
  onSession,
  onExpired,
}: SecuritySettingsProps) {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wizard, setWizard] = useState<Wizard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const action = useSecurityAction(onExpired);
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setStatus(await api.security());
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExpired();
      else setLoadError(error instanceof Error ? error.message : "Unable to load settings.");
    }
  }, [onExpired]);
  useEffect(() => {
    void load();
  }, [load]);
  async function cancel() {
    await api.cancelMfa();
    setWizard(null);
    await load();
  }
  async function complete() {
    const session = await api.confirmMfa();
    setWizard(null);
    setNotice("Security settings updated. Other signed-in sessions must sign in again.");
    onSession(session);
    await load();
  }

  const verifyIdentity = (password: string, factor: string, kind: FactorKind) =>
    void action.run(async () => {
      if (!wizard) return;
      const setup = await api.startMfa(wizard.operation, password, factor, kind);
      setWizard({
        ...wizard,
        setup,
        step: setup.recoveryCodes ? "codes" : "authenticator",
        codes: setup.recoveryCodes
          ? { recoveryCodes: setup.recoveryCodes, expiresAt: setup.expiresAt }
          : undefined,
      });
    });

  const verifyAuthenticator = (code: string) =>
    void action.run(async () => {
      if (!wizard) return;
      const codes = await api.verifyEnrollment(code);
      setWizard({ ...wizard, step: "codes", codes });
    });

  return {
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
    verifyIdentity,
    verifyAuthenticator,
    requiredSetup,
  };
}
