import type { FormEvent } from "react";
import { useState } from "react";
import { api } from "../../services/api";
import type { MfaLoginProps } from "../../types/componentProps";
import type { FactorKind } from "../../types/models";
import { useSecurityAction } from "./useSecurityAction";

export function useMfaLogin({ onSession, onExpired, onLogout }: MfaLoginProps) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<FactorKind>("TOTP");
  const action = useSecurityAction(onExpired);
  function submit(event: FormEvent) {
    event.preventDefault();
    void action.run(async () => {
      onSession(await api.verifyMfa(code.trim(), kind));
      setCode("");
    });
  }

  const logout = () =>
    void action.run(async () => {
      await api.logout();
      onLogout();
    });

  return { code, setCode, kind, setKind, action, submit, logout };
}
