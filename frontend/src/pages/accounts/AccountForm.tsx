import { AccountFormView } from "../../components/organisms/accounts/AccountFormView";
import { useAccountForm } from "../../hooks/accounts/useAccountForm";
import type { AccountFormProps } from "../../types/componentProps";

export function AccountForm(props: AccountFormProps) {
  const model = useAccountForm(props);
  return <AccountFormView {...model} />;
}
