import { useState } from "react";
import type { AccountAppearance, FinancialAccount } from "../../types/models";
import { accountColor, prepareAccountLogo } from "../../utils/accountVisuals";
export function useAccountCardSettings(
  saveAppearance: (account: FinancialAccount, input: AccountAppearance) => Promise<boolean>,
) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, AccountAppearance>>({});
  const [imageError, setImageError] = useState("");
  const [processing, setProcessing] = useState(false);
  function appearance(account: FinancialAccount): AccountAppearance {
    return drafts[account.id] ?? { color: accountColor(account), logo: account.logo ?? "TYPE" };
  }
  function change(account: FinancialAccount, patch: Partial<AccountAppearance>) {
    setDrafts((previous) => ({
      ...previous,
      [account.id]: { ...(previous[account.id] ?? appearance(account)), ...patch },
    }));
    setImageError("");
  }
  async function image(account: FinancialAccount, file: File) {
    setProcessing(true);
    setImageError("");
    try {
      change(account, { logo: "CUSTOM", logoData: await prepareAccountLogo(file) });
    } catch (error) {
      setImageError(error instanceof Error ? error.message : "Unable to read this image.");
    } finally {
      setProcessing(false);
    }
  }
  async function save(account: FinancialAccount) {
    if (await saveAppearance(account, appearance(account)))
      setDrafts((previous) => {
        const next = { ...previous };
        delete next[account.id];
        return next;
      });
  }
  return {
    open,
    processing,
    imageError,
    appearance,
    change,
    image,
    save,
    isDirty: (id: string) => !!drafts[id],
    show: () => {
      setDrafts({});
      setImageError("");
      setOpen(true);
    },
    close: () => setOpen(false),
    reset: () => {
      setDrafts({});
      setImageError("");
    },
  };
}
