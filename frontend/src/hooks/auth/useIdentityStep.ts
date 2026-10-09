import type { FormEvent } from "react";
import { useState } from "react";
import type { IdentityStepProps } from "../../types/componentProps";
import type { FactorKind } from "../../types/models";

export function useIdentityStep({ existing, disabled, onSubmit }: IdentityStepProps) {
  const [password, setPassword] = useState("");
  const [factor, setFactor] = useState("");
  const [kind, setKind] = useState<FactorKind>("TOTP");
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit(password, factor.trim(), kind);
    setPassword("");
    setFactor("");
  }

  return {
    password,
    setPassword,
    factor,
    setFactor,
    kind,
    setKind,
    submit,
    existing,
    disabled,
    onSubmit,
  };
}
