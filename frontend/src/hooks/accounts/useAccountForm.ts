import type { FormEvent } from "react";
import { useState } from "react";

import { api, ApiError } from "../../services/api";
import type { CreateAccount } from "../../types/models";

import type { AccountFormProps } from "../../types/componentProps";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function useAccountForm({ account, onCancel, onCreated, onExpired }: AccountFormProps) {
  const [input, setInput] = useState<CreateAccount>(
    account
      ? {
          name: account.name,
          type: account.type,
          institution: account.institution ?? "",
          currency: account.currency,
          openingAmount:
            account.type === "CREDIT_CARD"
              ? account.openingBalance.replace(/^-/, "")
              : account.openingBalance,
          openingDate: account.openingDate,
          balanceMeaning:
            account.type === "CREDIT_CARD"
              ? account.openingBalance.startsWith("-")
                ? "AMOUNT_OWED"
                : "IN_CREDIT"
              : "BALANCE",
        }
      : {
          name: "",
          type: "CHECKING",
          institution: "",
          currency: "",
          openingAmount: "0",
          openingDate: today(),
          balanceMeaning: "BALANCE",
        },
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [stale, setStale] = useState(false);
  const locked = account?.hasActivity ?? false;
  const creditCard = input.type === "CREDIT_CARD";
  function change<K extends keyof CreateAccount>(key: K, value: CreateAccount[K]) {
    setInput((previous) => ({ ...previous, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFields({});
    try {
      const normalized = {
        ...input,
        name: input.name.trim(),
        currency: input.currency.trim().toUpperCase(),
      };
      onCreated(
        await (account ? api.updateAccount(account, normalized) : api.createAccount(normalized)),
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) onExpired();
      else {
        setError(errorMessage(err));
        if (err instanceof ApiError) setFields(err.fields);
        if (err instanceof ApiError && err.status === 412) setStale(true);
      }
    } finally {
      setPending(false);
    }
  }

  function accessibility(name: string) {
    return {
      "aria-invalid": !!fields[name],
      "aria-describedby": fields[name] ? `${name}-error` : undefined,
    };
  }

  return {
    input,
    setInput,
    pending,
    error,
    fields,
    stale,
    locked,
    creditCard,
    change,
    submit,
    accessibility,
    account,
    onCancel,
  };
}
