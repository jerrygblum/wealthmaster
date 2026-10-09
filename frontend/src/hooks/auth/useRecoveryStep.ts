import { useState } from "react";
import type { RecoveryStepProps } from "../../types/componentProps";

export function useRecoveryStep({ codes, disabled, label, onConfirm }: RecoveryStepProps) {
  const [saved, setSaved] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const text =
    "Wealth Master recovery codes — keep private. Each code can be used once.\n\n" +
    codes.recoveryCodes.join("\n") +
    "\n";
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("Recovery codes copied.");
    } catch {
      setCopyMessage("Copy unavailable. Download the codes or copy them manually.");
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "wealthmaster-recovery-codes.txt";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { saved, setSaved, copyMessage, copy, download, codes, disabled, label, onConfirm };
}
