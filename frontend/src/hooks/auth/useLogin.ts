import type { FormEvent } from "react";
import { useEffect, useState } from "react";

import { api } from "../../services/api";

import type { LoginPageProps } from "../../types/componentProps";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function useLogin({ notice, onLogin }: LoginPageProps) {
  const [registrationEnabled, setRegistrationEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    async function loadPolicy() {
      try {
        const policy = await api.registrationPolicy();
        if (active) setRegistrationEnabled(policy.enabled);
      } catch {
        /* Registration availability must not block login. */
      }
    }
    void loadPolicy();
    return () => {
      active = false;
    };
  }, []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      onLogin(await api.login(email.trim(), password));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPassword("");
      setPending(false);
    }
  }

  return {
    registrationEnabled,
    email,
    setEmail,
    password,
    setPassword,
    pending,
    error,
    submit,
    notice,
  };
}
