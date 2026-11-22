import { BalanceOnDateView } from "../../components/organisms/accounts/BalanceOnDateView";
import { useAccountBalance } from "../../hooks/accounts/useAccountBalance";
import type { FinancialAccount } from "../../types/models";
export function AccountBalancePanel({
  account,
  onExpired,
}: {
  account: FinancialAccount;
  onExpired: () => void;
}) {
  const model = useAccountBalance(account, onExpired);
  return <BalanceOnDateView {...model} />;
}
