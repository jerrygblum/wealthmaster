import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api, ApiError } from "../../services/api";
import type { Session } from "../../types/models";

export function useRegistration(onLogin: (session: Session) => void) {
  const [enabled, setEnabled] = useState<boolean>();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let active = true;
    void api
      .registrationPolicy()
      .then((policy) => {
        if (active) setEnabled(policy.enabled);
      })
      .catch(() => {
        if (active) setError("Unable to check registration availability. Reload and try again.");
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Passwords must match.");
      setPassword("");
      setConfirmation("");
      setCode("");
      return;
    }
    setPending(true);
    try {
      onLogin(await api.register({ email: email.trim(), code: code.trim(), password }));
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 403 &&
        error.message === "Registration is disabled."
      )
        setEnabled(false);
      setError(error instanceof Error ? error.message : "Unable to register. Try again.");
    } finally {
      setPending(false);
      setPassword("");
      setConfirmation("");
      setCode("");
    }
  }
  return {
    enabled,
    email,
    setEmail,
    code,
    setCode,
    password,
    setPassword,
    confirmation,
    setConfirmation,
    error,
    pending,
    submit,
  };
}
