import { useState } from "react";
import type { AccountType, FinancialAccount } from "../../types/models";
import { accountTypes } from "../../utils/accountPresentation";
const paths: Record<AccountType, string> = {
  CHECKING: "M3 10h18L12 3Z M5 12v7 M10 12v7 M15 12v7 M19 12v7 M3 21h18",
  SAVINGS: "M5 10a7 6 0 0 1 13-2l3 1v6l-3 1-1 4h-3l-1-3H9l-1 3H5l-1-5-2-2V9l3 1 M9 5h5 M16 10h.01",
  CASH: "M3 6h18v12H3Z M7 6v3H3 M21 15h-4v3 M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  CREDIT_CARD: "M3 5h18v14H3Z M3 9h18 M6 15h4",
  INVESTMENT: "M4 3v18h17 M7 15l4-5 4 2 6-8",
  OTHER: "M3 8l9-5 9 5-9 5Z M3 12l9 5 9-5 M3 16l9 5 9-5",
};
export function AccountLogo({
  account,
}: {
  account: Pick<FinancialAccount, "type" | "logo" | "logoData">;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (account.logo === "CUSTOM" && account.logoData && failed !== account.logoData)
    return (
      <span className="account-logo">
        <img
          src={account.logoData}
          alt="Custom account logo"
          onError={() => setFailed(account.logoData ?? null)}
        />
      </span>
    );
  const mark =
    account.logo && account.logo !== "TYPE" && account.logo !== "CUSTOM" ? account.logo : null;
  if (mark)
    return (
      <span
        className="account-logo bank-mark"
        data-bank={mark}
        role="img"
        aria-label={`${mark} bank mark`}
      >
        {
          (
            { UBS: "UBS", POSTFINANCE: "pf", RAIFFEISEN: "R", ZKB: "ZKB", REVOLUT: "R·" } as Record<
              string,
              string
            >
          )[mark]
        }
      </span>
    );
  return (
    <span
      className="account-logo"
      role="img"
      aria-label={`${accountTypes[account.type]} account icon`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={paths[account.type]} />
      </svg>
    </span>
  );
}
