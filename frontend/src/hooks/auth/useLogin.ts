import type { FormEvent } from "react";
import { useState } from "react";

import { api } from "../../services/api";

import type { LoginPageProps } from "../../types/componentProps";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function useLogin({ notice, onLogin }: LoginPageProps) {
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

  return { email, setEmail, password, setPassword, pending, error, submit, notice };
}
